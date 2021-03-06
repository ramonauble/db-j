//'use strict';

$(document).ready(function() {
  //create audio context
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const synthCtx = new AudioContext({sampleRate: 36000});
  const distCurve = makeCurve(20); //generate distortion curve
  //create voice
  let voice1 = new Voice(synthCtx, distCurve);
  var bpm = 120.0; //current tempo of sequencer & reference for LFOs (mode 2)
  var root = 440.0; //A-440
  //instantiate analyser node (for oscilloscope display)
  var scopeX = synthCtx.createAnalyser();
  var scopeY = synthCtx.createAnalyser();
  var scopeW = synthCtx.createAnalyser();
  var scopeGain = synthCtx.createGain();
  scopeGain.gain.value = 3.6;
  var scopeSplitter = synthCtx.createChannelSplitter();
  scopeX.fftSize = 512;
  scopeY.fftSize = 512;
  scopeW.fftSize = 512;
  //calculate reverb impulse response & assign to convolver node buffer
  calcIR();
  //init voice
  voice1.mixGain.connect(scopeGain).connect(scopeW); //oscilloscope analyzer
  voice1.mixGain.connect(scopeGain).connect(scopeSplitter); //lissajous analyzer
  scopeSplitter.connect(scopeX, 0);
  scopeSplitter.connect(scopeY, 1);
  voice1.start();

  //reference canvas & get/configure context for drawing
  const $displayCanv = $("#displayCanv");
  const displayCanvCtx = $displayCanv[0].getContext("2d");
  const dCanvW = displayCanv.width;
  const dCanvH = displayCanv.height;
  displayCanvCtx.fillStyle = "#5D2E7B";
  displayCanvCtx.lineWidth = 3;
  displayCanvCtx.strokeStyle = "#FFFFFF";
  displayCanvCtx.font = "30px monospace";
  displayCanvCtx.textAlign = "center";

  //reference lfo parameter span elements & index with slider ids
  const $lfoInfo = {
    lfoS1: $("#lfoInfo1"),
    lfoS2: $("#lfoInfo2"),
    lfoS3: $("#lfoInfo3")
  };
  const $lfoInfo2 = {
    base: $("#lfoBase"),
    freq: $("#lfoFreq")
  };
  var aRateModDict = []; //array to hold pages with a rate LFO mod
  var bpmModDict = []; //array to hold pages with bpm LFO mod

  //reference lfo patch state elements & index with integers
  const $patchButtons = {
    1: $("#PS1"),
    2: $("#PS2"),
    3: $("#PS3"),
    4: $("#PS4"),
    5: $("#PS5"),
    6: $("#PS6")
  };
  //to convert between index & id
  const patchConv = {
    1: "PS1",
    2: "PS2",
    3: "PS3",
    4: "PS4",
    5: "PS5",
    6: "PS6"
  };
  //dictionary to convery between patch select IDs & slider IDs (for LFO routing)
  const patchConv2 = {
    PS1: "s1",
    PS2: "s2",
    PS3: "s3",
    PS4: "s4",
    PS5: "s5",
    PS6: "s6"
  };
  const $modeButtons = $(".modeSelect"); //lfo mode select divs

  //configure variables for drawing canvas
  const pi = Math.PI;
  var binLength = scopeX.frequencyBinCount; //fftSize/2 == 256
  var tdWaveX = new Float32Array(binLength); //256 floats [-1, 1]
  var tdWaveY = new Float32Array(binLength); //256 floats [-1, 1]
  var tdWaveW = new Float32Array(binLength); //256 floats [-1, 1]
  var binWidth = (dCanvW * 1.0) / binLength; //width of each "pixel"

  //reference to page title DOM object
  var $pageTitle = $("#pageTitle");

  //slider jquery object dictionary
  //(for faster selection during page changes)
  var $sliderDict = {
    s1: $("#s1"),
    s2: $("#s2"),
    s3: $("#s3"),
    s4: $("#s4"),
    s5: $("#s5"),
    s6: $("#s6")
  };
  //same for lfo sliders
  var $lfoSliderDict = {
    lfoS1: $("#lfoS1"),
    lfoS2: $("#lfoS2"),
    lfoS3: $("#lfoS3")
  };
  var lfoShapeDict = {
    1: "sin",
    2: "tri",
    3: "sqr",
    4: "saw"
  };
  var lfoShapeSetDict = {
    1: "sine",
    2: "triangle",
    3: "square",
    4: "sawtooth"
  };

  //color dictionary to assocate page selection
  //with canvas fill & title colors
  var colorsDict = {
    oscButton: "#5D2E7B",
    ratButton: "#A15ECE",
    ofxButton: "#C75858",
    panButton: "#8AC497",
    ampButton: "#848EDF",
    revButton: "#DB689C"
  };

  //title dictionary to map page selection to page title
  var titleDict = {
    oscButton: "mix",
    ratButton: "tune",
    ofxButton: "shape",
    panButton: "pan",
    ampButton: "envelope",
    revButton: "crush"
  };

  //define exponent numerators for calculating frequencies
  //from key presses (single octave chromatic scale)
  var keyDict = {
    65: 0, //a - C
    87: 1, //w - C#
    83: 2, //s - D
    69: 3, //e - D#
    68: 4, //d - E
    70: 5, //f - F
    84: 6, //t - F#
    71: 7, //g - G
    89: 8, //y - G#
    72: 9, //h - A
    85: 10, //u - A#
    74: 11, //j - B
    75: 12  //k - C2
  };

  //init active param page to osc page
  var activePage = "oscButton";
  //init active display page to info page
  var activeUI = "wave";

  //init sliders
  pageChange("oscButton");
  //start test
  $(".pageButton").click(function() {
    synthCtx.resume();
    pageChange($(this).attr("id"));
  });

  //handle slider input for all slider page classes
  $(".pSlider").on("input", function() {
    let $this = $(this);
    if ($this.hasClass("oscSlider")) {
      voice1.sliderVals["oscButton"][$this.attr("id")] = $this.val(); //save value
      var currentGain = voice1.gainNodeDict[$this.attr("id")];
      currentGain.setTargetAtTime(($this.val()/255.0), synthCtx.currentTime, .005); //set gain
    } else if ($this.hasClass("ratSlider")) {
      voice1.sliderVals["ratButton"][$this.attr("id")] = $this.val();
      changeFreqs(synthCtx.currentTime, lastKey);
    } else if ($this.hasClass("ofxSlider")) {
      voice1.sliderVals["ofxButton"][$this.attr("id")] = $this.val();
      var currentDist = voice1.distNodeDict[$this.attr("id")];
      var currentPre = voice1.preNodeDict[$this.attr("id")];
      currentPre.setTargetAtTime(($this.val()/256), synthCtx.currentTime, .005);
      currentDist.gain.setTargetAtTime(($this.val()/256), synthCtx.currentTime, .005);
    } else if ($this.hasClass("panSlider")) {
      voice1.sliderVals["panButton"][$this.attr("id")] = $this.val();
      var currentOscP = voice1.oscPanDict[$this.attr("id")];
      currentOscP.setTargetAtTime(($this.val()/255.0), synthCtx.currentTime, .005);
    } else if ($this.hasClass("ampSlider")) {
      voice1.sliderVals["ampButton"][$this.attr("id")] = $this.val();
      var currentEnvP = voice1.envParamDict[$this.attr("id")];
      currentEnvP.setTargetAtTime(($this.val()/255.0), synthCtx.currentTime, .005);
    } else if ($this.hasClass("revSlider")) {
      voice1.sliderVals["revButton"][$this.attr("id")] = $this.val();
      var currentCrushRate = voice1.crushRateDict[$this.attr("id")];
      var currentCrushDepth = voice1.crushDepthDict[$this.attr("id")];
      currentCrushRate.setTargetAtTime((1 - ($this.val()/255.0)), synthCtx.currentTime, .005);
      currentCrushDepth.setTargetAtTime((1 - ($this.val()/255.0)), synthCtx.currentTime, .005);
    }
  });

  //handle LFO slider input - speed, shape & depth
  $(".aSlider").on("input", function() {
    let $this = $(this);
    let id = $this.attr("id");
    if (id == "lfoS1") {
      let newLFOFreq = voice1.lfoFreqDict[activePage]*voice1.ratioDict[$this.val()]
      $lfoInfo[id].html("speed: " + voice1.ratioDict[$this.val()].toFixed(2) + "x");
      $lfoInfo2["freq"].html("freq: " + newLFOFreq.toFixed(2) + "Hz");
      voice1.lfoVals[activePage][$this.attr("id")] = $this.val();
      voice1.lfoNodeDict[activePage].frequency.setTargetAtTime(newLFOFreq, synthCtx.currentTime, .005);
    } else if (id == "lfoS2") {
      $lfoInfo[id].html("shape: " + lfoShapeDict[$this.val()]);
      voice1.lfoVals[activePage][$this.attr("id")] = $this.val();
      voice1.lfoNodeDict[activePage].type = lfoShapeSetDict[$this.val()];
    } else if (id == "lfoS3") {
      $lfoInfo[id].html("depth: " + parseFloat($this.val()).toFixed(1) + "%");
      voice1.lfoVals[activePage][$this.attr("id")] = $this.val();
      if (activePage == "ratButton") {
        voice1.lfoGainDict[activePage].gain
        .setTargetAtTime(($this.val()), synthCtx.currentTime, .005);
      } else {
        voice1.lfoGainDict[activePage].gain
        .setTargetAtTime(($this.val()/100.0), synthCtx.currentTime, .005);
      }
    }
  });

  //handle bpm slider value change
  var $bpmDisp = $("#bpmDisp");
  var $bpmSlider = $("#bpmSlider");
  var newBPM; var newBase; var currentLFORatio; var newLFOFreq;
  $("#bpmSlider").on("input", function() {
    newBPM = $bpmSlider.val();
    bpm = newBPM*1.0;
    gateTime = 1000*((1/bpm)/128); //half st time
    sixteenthTime = 1000*((1/bpm)/64); //length of one sixteenth note in seconds
    newBase = (bpm/60.0);
    $bpmDisp.html("bpm: " + bpm.toFixed(1));
    for (let i = 0; i < bpmModDict.length; i++) {
      voice1.lfoFreqDict[bpmModDict[i]] = newBase; //set new base frequency
      currentLFORatio = voice1.ratioDict[voice1.lfoVals[bpmModDict[i]]["lfoS1"]];
      newLFOFreq = newBase * currentLFORatio; //calc new LFO frequency
      voice1.lfoNodeDict[bpmModDict[i]].frequency.setTargetAtTime(newLFOFreq, synthCtx.currentTime, .00005); //set freq
      if (activePage == bpmModDict[i]) {
        $lfoInfo2["base"].html("base: " + voice1.lfoFreqDict[activePage].toFixed(2) + "Hz");
        $lfoInfo2["freq"].html("freq: " + newLFOFreq.toFixed(2) + "Hz");
      }
    }
  });

  //handle reverb slider value change
  var $reverbDisp = $("#reverbDisp");
  var $revSlider = $("#reverbSlider");
  var newRevGain;
  $("#reverbSlider").on("input", function() {
    newRevGain = $revSlider.val()/255.0; //calc new reverb gain
    voice1.revGain.gain.setTargetAtTime(newRevGain, synthCtx.currentTime, .005);
    $reverbDisp.html("reverb: " + (100*newRevGain).toFixed(1) + "%");
  });

  //handle scale selection change
  var $scaleDisp = $("#scaleDisp");
  var $scaleSlider = $("#scaleSlider");
  var activeScale = parseInt($scaleSlider.val());
  $("#scaleSlider").on("input", function() {
    $scaleDisp.html(voice1.scaleText[$scaleSlider.val()]);
    activeScale = parseInt($scaleSlider.val());
  });

  //handle root selection change
  var $rootDisp = $("#rootDisp");
  var $rootSlider = $("#rootSlider");
  var rootOffset = parseInt($rootSlider.val());
  $("#rootSlider").on("input", function() {
    $rootDisp.html(voice1.rootText[$rootSlider.val()]);
    rootOffset = parseInt($rootSlider.val());
  });

  //handle UI page change event
  //  change UI colors, update slider vals & LFO params/patch states
  function pageChange(newPage) {
    activePage = newPage; //set newly active page
    //change UI colors - canvas, page title
    displayCanvCtx.fillStyle = colorsDict[newPage];
    $pageTitle.html(titleDict[newPage]);
    $pageTitle.css("color", colorsDict[newPage]);
    //update slider values for newly active page
    $sliderDict["s1"].val(voice1.sliderVals[newPage]["s1"]);
    $sliderDict["s2"].val(voice1.sliderVals[newPage]["s2"]);
    $sliderDict["s3"].val(voice1.sliderVals[newPage]["s3"]);
    $sliderDict["s4"].val(voice1.sliderVals[newPage]["s4"]);
    $sliderDict["s5"].val(voice1.sliderVals[newPage]["s5"]);
    $sliderDict["s6"].val(voice1.sliderVals[newPage]["s6"]);
    //update LFO slider values & info displays for newly active page
    $lfoSliderDict["lfoS1"].val(voice1.lfoVals[newPage]["lfoS1"]);
    $lfoSliderDict["lfoS2"].val(voice1.lfoVals[newPage]["lfoS2"]);
    $lfoSliderDict["lfoS3"].val(voice1.lfoVals[newPage]["lfoS3"]);
    $lfoInfo["lfoS1"].html("speed: " + parseFloat(voice1.ratioDict[voice1.lfoVals[newPage]["lfoS1"]]).toFixed(2) + "x");
    $lfoInfo["lfoS2"].html("shape: " + lfoShapeDict[voice1.lfoVals[newPage]["lfoS2"]]);
    $lfoInfo["lfoS3"].html("depth: " + parseFloat(voice1.lfoVals[newPage]["lfoS3"]).toFixed(1) + "%");
    $lfoInfo2["base"].html("base: " + voice1.lfoFreqDict[activePage].toFixed(2) + "Hz");
    $lfoInfo2["freq"].html("freq: " + (voice1.lfoFreqDict[activePage]*
    voice1.ratioDict[voice1.lfoVals[activePage]["lfoS1"]]).toFixed(2) + "Hz");
    //update LFO patch states
    for (let patch = 1; patch <= 6; patch++) {
      if (voice1.patchStates[activePage][patchConv[patch]] == 1) {
        $patchButtons[patch].addClass("selected");
        $patchButtons[patch].css("opacity", "100%");
      } else if (voice1.patchStates[activePage][patchConv[patch]] == 0) {
        $patchButtons[patch].removeClass("selected");
        $patchButtons[patch].css("opacity", "33%");
      }
    }
    //update UI to reflect active LFO mode for newly selected page
    let $currentMode = $("#" + voice1.modeStates[activePage]);
    $modeButtons.css("opacity", "50%");
    $modeButtons.removeClass("selected");
    $currentMode.css("opacity", "100%");
    $currentMode.addClass("selected");
  }

  //draw info & scope displays at ~30fps
  var lastUpdate;
  var updateTime = 33.333333; //ms
  function drawCanvas(timestamp) {
    if (lastUpdate == undefined || (timestamp - lastUpdate) > updateTime) {
      lastUpdate = timestamp; //record latest update time
      displayCanvCtx.fillRect(0, 0, dCanvW, dCanvH); //clear canvas
      if (activeUI == "info") { //draw info
        let p1 = voice1.sliderVals[activePage]["s1"];
        let p2 = voice1.sliderVals[activePage]["s2"];
        let p3 = voice1.sliderVals[activePage]["s3"];
        let p4 = voice1.sliderVals[activePage]["s4"];
        let p5 = voice1.sliderVals[activePage]["s5"];
        let p6 = voice1.sliderVals[activePage]["s6"];
        //draw oscillator & shape mix values
        if (activePage == "oscButton" || activePage == "ofxButton") {
          displayCanvCtx.lineWidth = 2.33;
          displayCanvCtx.strokeText(Math.trunc(100*(p1/255.0)) + "%", 55, 55);
          displayCanvCtx.strokeText(Math.trunc(100*(p2/255.0)) + "%", 150, 55);
          displayCanvCtx.strokeText(Math.trunc(100*(p3/255.0)) + "%", 245, 55);
          displayCanvCtx.strokeText(Math.trunc(100*(p4/255.0)) + "%", 55, 120);
          displayCanvCtx.strokeText(Math.trunc(100*(p5/255.0)) + "%", 150, 120);
          displayCanvCtx.strokeText(Math.trunc(100*(p6/255.0)) + "%", 245, 120);
        //draw ratio values
        } else if (activePage == "ratButton") {
          displayCanvCtx.lineWidth = 2.33;
          displayCanvCtx.strokeText((voice1.sliderVals["ratButton"]["s1"] - 127) >> 3, 55, 55);
          displayCanvCtx.strokeText((voice1.sliderVals["ratButton"]["s2"] - 127) >> 3, 150, 55);
          displayCanvCtx.strokeText((voice1.sliderVals["ratButton"]["s3"] - 127) >> 3, 245, 55);
          displayCanvCtx.strokeText((voice1.sliderVals["ratButton"]["s4"] - 127) >> 3, 55, 120);
          displayCanvCtx.strokeText((voice1.sliderVals["ratButton"]["s5"] - 127) >> 3, 150, 120);
          displayCanvCtx.strokeText((voice1.sliderVals["ratButton"]["s6"] - 127) >> 3, 245, 120);
        //draw panning position display
        } else if (activePage == "panButton") {
          //draw horizontal lines
          displayCanvCtx.lineWidth = 4;
          displayCanvCtx.beginPath();
          displayCanvCtx.strokeStyle = "#000000"
          displayCanvCtx.moveTo(25, 45); displayCanvCtx.lineTo(85, 45); displayCanvCtx.stroke();
          displayCanvCtx.moveTo(120, 45); displayCanvCtx.lineTo(180, 45); displayCanvCtx.stroke();
          displayCanvCtx.moveTo(215, 45); displayCanvCtx.lineTo(275, 45); displayCanvCtx.stroke();
          displayCanvCtx.moveTo(25, 110); displayCanvCtx.lineTo(85, 110); displayCanvCtx.stroke();
          displayCanvCtx.moveTo(120, 110); displayCanvCtx.lineTo(180, 110); displayCanvCtx.stroke();
          displayCanvCtx.moveTo(215, 110); displayCanvCtx.lineTo(275, 110); displayCanvCtx.stroke();
          //draw vertical lines at center
          displayCanvCtx.lineWidth = 3;
          displayCanvCtx.beginPath();
          displayCanvCtx.strokeStyle = "#d5f5dc"
          displayCanvCtx.moveTo(55, 36.5); displayCanvCtx.lineTo(55, 53.5); displayCanvCtx.stroke();
          displayCanvCtx.moveTo(150, 36.5); displayCanvCtx.lineTo(150, 53.5); displayCanvCtx.stroke();
          displayCanvCtx.moveTo(245, 36.5); displayCanvCtx.lineTo(245, 53.5); displayCanvCtx.stroke();
          displayCanvCtx.moveTo(55, 101.5); displayCanvCtx.lineTo(55, 118.5); displayCanvCtx.stroke();
          displayCanvCtx.moveTo(150, 101.5); displayCanvCtx.lineTo(150, 118.5); displayCanvCtx.stroke();
          displayCanvCtx.moveTo(245, 101.5); displayCanvCtx.lineTo(245, 118.5); displayCanvCtx.stroke();
          //draw characters to display active pan locations
          displayCanvCtx.fillStyle = "#FFFFFF";
          displayCanvCtx.font = "40px monospace"
          displayCanvCtx.fillText("•", 25 + 60*(p1/255.0), 55.5);
          displayCanvCtx.fillText("•", 120 + 60*(p2/255.0), 55.5);
          displayCanvCtx.fillText("•", 215 + 60*(p3/255.0), 55.5);
          displayCanvCtx.fillText("•", 25 + 60*(p4/255.0), 120.5);
          displayCanvCtx.fillText("•", 120 + 60*(p5/255.0), 120.5);
          displayCanvCtx.fillText("•", 215 + 60*(p6/255.0), 120.5);
          displayCanvCtx.font = "30px monospace"
          displayCanvCtx.fillStyle = colorsDict["panButton"];
          displayCanvCtx.strokeStyle = "#FFFFFF"
        } else if (activePage == "ampButton") {
          displayCanvCtx.lineWidth = 4;
          let baseCurveF = (255 - p5)/255.0;
          let aCurveF = 25*(p1/255.0)*baseCurveF; dCurveF = 25*(p2/255.0)*baseCurveF; rCurveF = 25*(p4/255.0)*baseCurveF;
          let aXStart = 0; let aYStart = dCanvH;
          let aXEnd = (dCanvW/4)*(p1/255.0); let aYEnd = dCanvH*(1 - (p6/255.0));
          let dXEnd = aXEnd + (dCanvW/4)*(p2/255.0); let dYEnd = dCanvH*(1 - (p3/255.0)*(p6/255.0));
          let sXEnd = .75*dCanvW + (dCanvW/4)*(1 - (p4/255.0));
          displayCanvCtx.beginPath();
          displayCanvCtx.moveTo(aXStart, aYStart); //bottom left corner
          displayCanvCtx.quadraticCurveTo((aXEnd - aXStart)/2.0 + aCurveF, (aYStart - aYEnd)/2 + aYEnd, aXEnd, aYEnd);
          displayCanvCtx.stroke();
          displayCanvCtx.quadraticCurveTo((dXEnd - aXEnd)/2.0 + aXEnd - dCurveF, dYEnd - (dYEnd - aYEnd)/2.0, dXEnd, dYEnd);
          displayCanvCtx.stroke();
          displayCanvCtx.lineTo(sXEnd, dYEnd);
          displayCanvCtx.stroke();
          displayCanvCtx.quadraticCurveTo(sXEnd + (dCanvW - sXEnd)/2.0 - rCurveF, dYEnd + (dCanvH - dYEnd)/2.0, dCanvW, dCanvH);
          displayCanvCtx.stroke();
        } else if (activePage == "revButton") {
          displayCanvCtx.lineWidth = 3;
          displayCanvCtx.beginPath();
          displayCanvCtx.fillStyle = "#FFFFFF";
          displayCanvCtx.arc(55, 45, (25*(p1/255.0) + 3), 0, 2*pi);
          displayCanvCtx.arc(150, 45, (25*(p2/255.0) + 3), 0, 2*pi);
          displayCanvCtx.arc(245, 45, (25*(p3/255.0) + 3), 0, 2*pi);
          displayCanvCtx.fill();
          displayCanvCtx.beginPath();
          displayCanvCtx.arc(55, 110, (25*(p4/255.0) + 3), 0, 2*pi);
          displayCanvCtx.arc(150, 110, (25*(p5/255.0) + 3), 0, 2*pi);
          displayCanvCtx.arc(245, 110, (25*(p6/255.0) + 3), 0, 2*pi);
          displayCanvCtx.fill();
          displayCanvCtx.fillStyle = colorsDict["revButton"];
        }
      } else if (activeUI == "wave") { //draw scope
        scopeW.getFloatTimeDomainData(tdWaveW);
        displayCanvCtx.lineWidth = 4;
        displayCanvCtx.beginPath();
        let xW = 0; //horizontal accumulator
        let startIndex = 0;
        let endIndex = 255;
        let firstChange = 0;
        let widthBase;
        for (let m = 1; m < binLength; m++) {
          if (firstChange == 0) {
            if (tdWaveW[startIndex] != tdWaveW[m]) {
              firstChange = m;
            }
          }
        }
        let reverseSign = 1;
        if (tdWaveW[startIndex] > tdWaveW[firstChange]) { //if decreasing after zero crossing
          reverseSign = -1;
        }
        widthBase = binLength - startIndex - (256 - endIndex);
        binWidth = (dCanvW * 1.0) / widthBase;
        for (let n = startIndex; n <= endIndex; n++) {
          let yW = (dCanvH/2) - tdWaveW[n]*(dCanvH/2) * reverseSign;
          if (n == startIndex) {
            displayCanvCtx.moveTo(xW, yW);
          } else {
            displayCanvCtx.lineTo(xW, yW);
          }
          xW += binWidth;
        }
        displayCanvCtx.stroke();
      } else if (activeUI == "liss") { //draw lissajous curve
        scopeX.getFloatTimeDomainData(tdWaveX); //grab TD waveforms for X/Y
        scopeY.getFloatTimeDomainData(tdWaveY);
        displayCanvCtx.lineWidth = 4;
        displayCanvCtx.beginPath();
        for (let n = 0; n < binLength; n++) {
          let x = (dCanvW/2) + tdWaveX[n]*(dCanvW/2);
          let y = (dCanvH/2) - tdWaveY[n]*(dCanvH/2);
          if (n == 0) {
            displayCanvCtx.moveTo(x, y);
          } else {
            displayCanvCtx.lineTo(x, y);
          }
        }
        displayCanvCtx.stroke();
      }
    }
    window.requestAnimationFrame(drawCanvas);
  }
  window.requestAnimationFrame(drawCanvas);

  //handle UI display page change - modify active state for canvas drawing
  $(".uiButton").click(function() {
    let $this = $(this);
    if ($this.attr("id") == "infoButton") {
      activeUI = "info";
    } else if ($this.attr("id") == "waveButton") {
      if (activeUI == "wave") {
        activeUI = "liss";
      } else if (activeUI == "liss" || activeUI == "info") {
        activeUI = "wave";
      }
    }
  });

  //calculate sigmoid distortion curve
  function makeCurve(amount) {
    let curveOut = new Float32Array(256);
    let xVal = 0;
    for (let i = 0; i < 256; i++) {
      xVal = ((i/255)*2) - 1; //normalize input value to [-1, 1]
      curveOut[i] = ((Math.PI + amount)*xVal)/(Math.PI + (amount*Math.abs(xVal)));
    }
    return curveOut;
  }

  //retrieve impulse response for reverb & assign to convolver node buffer
  async function calcIR() {
    let wavFile = await fetch("./wavData/ir4.wav");
    let wavBuffer = await wavFile.arrayBuffer();
    voice1.reverb.buffer = await synthCtx.decodeAudioData(wavBuffer);
  }

  //resume context
  var resume = function() {
    synthCtx.resume();
    voice1.start();
  };

  var keysDict = []; //dictionary for keys currently held down
  var numKeys = 0;   //number of keys held at any instant
  //default to 5th octave of chromatic scale
  var octaveOffset = 0;
  var shiftPressed = false; //shift state
  var leftPressed = false; //left arrow state
  var rightPressed = false; //right arrow state
  //catch input for the following:
  //  keyboard note press
  //    log keypress in dict, recalculate new fundamental, change osc. frequencies
  //  shift press - logs shift state
  //  U/D arrow keys - shifts keyboard octave down/up
  //  L/R arrow keys - logs arrow states for note sequence programming (L:a. R:b)
  $(document).keydown(function(event) {
    let expOffset = keyDict[event.which];
    if (expOffset !== undefined) {
      if (!keysDict.includes(expOffset)) {  //if key not in dictionary
        numKeys = keysDict.push(expOffset); //add key to end of dictionary & trigger envelope
        if (!seqPlay) { //only retrigger envelope if sequencer not playing
          voice1.trigEnv.setValueAtTime(0, synthCtx.currentTime);
          voice1.trigEnv.setValueAtTime(1, synthCtx.currentTime + .0001);
        }
        expOffset = rootOffset + 12*octaveOffset + 12*Math.floor(keyDict[event.which]/voice1.scaleLength[activeScale])
        + voice1.scaleDict[activeScale][keyDict[event.which]%voice1.scaleLength[activeScale]];
        if (leftPressed && seqALength < 8) { //program note sequence A
          noteSeqA[seqALength] = event.which; //program note
          $noteADivs[seqALength].style.opacity = "67%";
          seqALength++;
        }
        if (rightPressed && seqBLength < 8) { //program note sequence A
          noteSeqB[seqBLength] = event.which; //program note
          $noteBDivs[seqBLength].style.opacity = "67%";
          seqBLength++;
        }
        changeFreqs(synthCtx.currentTime, event.which); //change oscillatgor frequencies
      }
    } else if (event.which == 16) { //catch shift press
      shiftPressed = true;
    } else if (event.which == 40 && shiftPressed) {
      if (octaveOffset > -2) { //left arrow - octave down
        octaveOffset--;
      }
    } else if (event.which == 38 && shiftPressed) {
      if (octaveOffset < 2) { //right arrow - octave up
        octaveOffset++;
      }
    } else if (event.which == 37) { //left arrow - program note sequence a
      if (leftPressed == false) { //if first press
        for (let i = 0; i < seqALength; i++) { //clear previous note sequence
          noteSeqA[i] = 65;
          $noteADivs[i].style.opacity = "33%";
        }
        seqALength = 0;
        noteAPos = 0;
      }
      leftPressed = true;
    } else if (event.which == 39) { //right arrow - program note sequence b
      if (rightPressed == false) { //if first press
        for (let i = 0; i < seqBLength; i++) { //clear previous note sequence
          noteSeqB[i] = 65;
          $noteBDivs[i].style.opacity = "33%";
        }
        seqBLength = 0;
        noteBPos = 0;
      }
      rightPressed = true;
    } else if (event.which == 32) { //space bar - start/stop sequencer
      if (!seqPlay) { //start sequencer
        trigPos = 0;
        startTime = synthCtx.currentTime;
        seqPlay = true;
      } else {        //stop sequencer
        seqPlay = false;
        //clear tracker
        for (let tempPos = 0; tempPos <= 15; tempPos++) {
          if (trigSeq[tempPos]) {
            $trigDivs[tempPos].style.opacity = "67%";
          } else {
            $trigDivs[tempPos].style.opacity = "33%";
          }
        }
        for (let tempPos = 0; tempPos < 8; tempPos++) {
          if (tempPos < seqALength) {
            $noteADivs[tempPos].style.opacity = "67%";
          } else {
            $noteADivs[tempPos].style.opacity = "33%";
          }
          if (tempPos < seqBLength) {
            $noteBDivs[tempPos].style.opacity = "67%";
          } else {
            $noteBDivs[tempPos].style.opacity = "33%";
          }
        }
        noteAPos = 0;
        noteBPos = 0;
      }
    }
  });

  $(".trigSeq").click(function() {
    let $this = $(this);
    let index = trigConv[$this.attr("id")];
    if (!trigSeq[index]) { //off to on
      trigSeq[index] = 1;
      $this.css("opacity", "67%");
    } else {               //on to off
      trigSeq[index] = 0;
      $this.css("opacity", "33%");
    }
  });
  var trigConv = {trig1: 0, trig2: 1, trig3: 2, trig4: 3,
                  trig5: 4, trig6: 5, trig7: 6, trig8: 7,
                  trig9: 8, trig10: 9, trig11: 10, trig12: 11,
                  trig13: 12, trig14: 13, trig15: 14, trig16: 15};
  //sequencer
  var startTime;  //base time for scheduling notes
  var gateTime = 1000*((1/bpm)/128);     //half st time
  var sixteenthTime = 1000*((1/bpm)/64); //length of one sixteenth note in seconds
  var seqPlay = false;  //sequencer state
  var trigSeq = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; //trig sequence
  var trigSeqLength = 15;  //length of trig sequence before restart
  var trigPos = 0;  //current position in trig sequence
  var noteSeqA = [65, 0, 0, 0, 0, 0, 0, 0];  //note sequence A
  var noteSeqB = [65, 0, 0, 0, 0, 0, 0, 0];  //note sequence B
  var seqALength = 0; //length of note sequence A
  var seqBLength = 0; //length of note sequence B
  var noteAPos = 0; //current position in note sequence A
  var noteBPos = 0; //current position in note sequence B
  var noteProb = 0; //note a/b probability
  var probA = 0;
  var probB = 0;
  var newFreq = 0;
  var $trigDivs = $(".trigSeq"); //trig seq divs for selection
  var $noteADivs = $(".noteA");  //note seq A divs
  var $noteBDivs = $(".noteB");  //note seq B divs
  //sequencer scheduling timer
  setInterval(function() {
    if (seqPlay) {
      if (synthCtx.currentTime >= startTime) {
        //schedule next note & advance start time
        startTime = startTime + sixteenthTime;
        if (trigPos == 0) {
          if (trigSeq[trigSeqLength]) {
            $trigDivs[trigSeqLength].style.opacity = "67%";
          } else {
            $trigDivs[trigSeqLength].style.opacity = "33%";
          }
          $trigDivs[0].style.opacity = "100%";
        } else {
          if (trigSeq[trigPos - 1]) {
            $trigDivs[trigPos - 1].style.opacity = "67%";
          } else {
            $trigDivs[trigPos - 1].style.opacity = "33%";
          }
          $trigDivs[trigPos].style.opacity = "100%";
        }
        if (noteAPos == 0) {
          if (seqALength > 1) {
            $noteADivs[seqALength - 1].style.opacity = "67%";
          }
          $noteADivs[0].style.opacity = "100%";
        } else {
          $noteADivs[noteAPos - 1].style.opacity = "67%";
          $noteADivs[noteAPos].style.opacity = "100%";
        }
        if (noteBPos == 0) {
          if (seqBLength > 1) {
            $noteBDivs[seqBLength - 1].style.opacity = "67%";
          }
          $noteBDivs[0].style.opacity = "100%";
        } else {
          $noteBDivs[noteBPos - 1].style.opacity = "67%";
          $noteBDivs[noteBPos].style.opacity = "100%";
        }
        if (trigSeq[trigPos]) {
          probA = (1 - noteProb)*Math.random();
          probB = noteProb*Math.random();
          if (probA >= probB) {
            newFreq = noteSeqA[noteAPos];
          } else {
            newFreq = noteSeqB[noteBPos]; //12tet
          }
          changeFreqs(startTime, newFreq);
          voice1.trigEnv.setValueAtTime(1, startTime);
          voice1.trigEnv.setValueAtTime(0, startTime + gateTime);
          if (noteAPos < (seqALength - 1)) {  //reset a sequence
            noteAPos++;
          } else {
            noteAPos = 0;
          }
          if (noteBPos < (seqBLength - 1)) {  //reset b sequence
            noteBPos++;
          } else {
            noteBPos = 0;
          }
        }
        if (trigPos < trigSeqLength) {
          trigPos++;
        } else {
          trigPos = 0;
        }
      }
    }
  }, 33.333333);


  $(".seqSlider").on("input", function() {
    let $this = $(this);
    let thisID = $this.attr("id");
    if (thisID == "gateSlider") { //change gate time
      gateTime = sixteenthTime * ($this.val()/100);
      $("#seqInfo1").html("gate: " + $this.val() + "%");
    } else if (thisID == "mixSlider") { //change note sequence probability mix
      noteProb = $this.val();
      $("#seqInfo2").html("morph: " + (100*noteProb).toFixed(0) + "%");
    } else if (thisID == "lengthSlider") {  //change trig sequence length
      let newLength = $this.val();
      trigSeqLength = newLength - 1;
      for (let tempPos = trigSeqLength; tempPos <= 15; tempPos++) { //clear extraneous trackers
        if (trigSeq[tempPos]) {
          $trigDivs[tempPos].style.opacity = "67%";
        } else {
          $trigDivs[tempPos].style.opacity = "33%";
        }
      }
      if (trigSeqLength < trigPos) {
        trigPos = 0;
      }
      $("#seqInfo3").html("length: " + newLength);
    }
  });

  //handle key release events to execute envelope release stage
  //catch shift/arrow release & change shift state
  $(document).keyup(function(event) {
    let expOffset = keyDict[event.which];
    if (expOffset !== undefined) {
      if (numKeys == 1) {
        voice1.trigEnv.setValueAtTime(0, synthCtx.currentTime);
      }
      if (keysDict.includes(expOffset)) {
        keysDict = keysDict.filter(key => key != expOffset);
      }
      numKeys = keysDict.length;
    } else if (event.which == 16) {
      shiftPressed = false;
    } else if (event.which == 37) {
      leftPressed = false;
    } else if (event.which == 39) {
      rightPressed = false;
    }
  });

  var f1; var f2; var f3; var f4; var f5; var f6;
  var o1 = 0; var o2 = 0; var o3 = 0; var o4 = 0; var o5 = 0; var o6 = 0;
  //recalculate all frequencies on note change event
  var lastKey = 65; //last key event - init to A
  function changeFreqs(changeTime, keyVal) {
    let fundOffset = rootOffset + 12*octaveOffset + 12*Math.floor(keyDict[keyVal]/voice1.scaleLength[activeScale])
    + voice1.scaleDict[activeScale][keyDict[keyVal]%voice1.scaleLength[activeScale]];
    voice1.fundamental = root*(2**(fundOffset/12.0));
    let baseOffset = rootOffset + 12*octaveOffset;
    lastKey = keyVal;
    o1 = baseOffset + 12*Math.floor((keyDict[keyVal] + ((voice1.sliderVals["ratButton"]["s1"] - 127) >> 3))/voice1.scaleLength[activeScale])
    + voice1.scaleDict[activeScale][(keyDict[keyVal] + ((voice1.sliderVals["ratButton"]["s1"] - 127) >> 3))%voice1.scaleLength[activeScale]];
    o2 = baseOffset + 12*Math.floor((keyDict[keyVal] + ((voice1.sliderVals["ratButton"]["s2"] - 127) >> 3))/voice1.scaleLength[activeScale])
    + voice1.scaleDict[activeScale][(keyDict[keyVal] + ((voice1.sliderVals["ratButton"]["s2"] - 127) >> 3))%voice1.scaleLength[activeScale]];
    o3 = baseOffset + 12*Math.floor((keyDict[keyVal] + ((voice1.sliderVals["ratButton"]["s3"] - 127) >> 3))/voice1.scaleLength[activeScale])
    + voice1.scaleDict[activeScale][(keyDict[keyVal] + ((voice1.sliderVals["ratButton"]["s3"] - 127) >> 3))%voice1.scaleLength[activeScale]];
    o4 = baseOffset + 12*Math.floor((keyDict[keyVal] + ((voice1.sliderVals["ratButton"]["s4"] - 127) >> 3))/voice1.scaleLength[activeScale])
    + voice1.scaleDict[activeScale][(keyDict[keyVal] + ((voice1.sliderVals["ratButton"]["s4"] - 127) >> 3))%voice1.scaleLength[activeScale]];
    o5 = baseOffset + 12*Math.floor((keyDict[keyVal] + ((voice1.sliderVals["ratButton"]["s5"] - 127) >> 3))/voice1.scaleLength[activeScale])
    + voice1.scaleDict[activeScale][(keyDict[keyVal] + ((voice1.sliderVals["ratButton"]["s5"] - 127) >> 3))%voice1.scaleLength[activeScale]];
    o6 = baseOffset + 12*Math.floor((keyDict[keyVal] + ((voice1.sliderVals["ratButton"]["s6"] - 127) >> 3))/voice1.scaleLength[activeScale])
    + voice1.scaleDict[activeScale][(keyDict[keyVal] + ((voice1.sliderVals["ratButton"]["s6"] - 127) >> 3))%voice1.scaleLength[activeScale]];
    f1 = root*(2**(o1/12.0));
    f2 = root*(2**(o2/12.0));
    f3 = root*(2**(o3/12.0));
    f4 = root*(2**(o4/12.0));
    f5 = root*(2**(o5/12.0));
    f6 = root*(2**(o6/12.0));
    voice1.oscNodeDict["s1"].frequency.setValueAtTime(f1, changeTime);
    voice1.oscNodeDict["s2"].frequency.setValueAtTime(f2, changeTime);
    voice1.oscNodeDict["s3"].frequency.setValueAtTime(f3, changeTime);
    voice1.oscNodeDict["s4"].frequency.setValueAtTime(f4, changeTime);
    voice1.oscNodeDict["s5"].frequency.setValueAtTime(f5, changeTime);
    voice1.oscNodeDict["s6"].frequency.setValueAtTime(f6, changeTime);
    voice1.baseFreqDict["s1"].setValueAtTime(f1*8, changeTime);
    voice1.baseFreqDict["s2"].setValueAtTime(f2*8, changeTime);
    voice1.baseFreqDict["s3"].setValueAtTime(f3*8, changeTime);
    voice1.baseFreqDict["s4"].setValueAtTime(f4*8, changeTime);
    voice1.baseFreqDict["s5"].setValueAtTime(f5*8, changeTime);
    voice1.baseFreqDict["s6"].setValueAtTime(f6*8, changeTime);
    for (let i = 0; i < aRateModDict.length; i++) {
      voice1.lfoFreqDict[aRateModDict[i]] = voice1.fundamental; //set new base frequency
      let currentLFORatio = voice1.ratioDict[voice1.lfoVals[aRateModDict[i]]["lfoS1"]];
      let newLFOFreq = voice1.fundamental * currentLFORatio; //calc new LFO frequency
      voice1.lfoNodeDict[aRateModDict[i]].frequency.setValueAtTime(newLFOFreq, changeTime); //set freq
      if (activePage == aRateModDict[i]) {
        $lfoInfo2["base"].html("base: " + voice1.lfoFreqDict[activePage].toFixed(2) + "Hz");
        $lfoInfo2["freq"].html("freq: " + newLFOFreq.toFixed(2) + "Hz");
      }
    }
  }

  $(".patchSelect").click(function() {
    let $this = $(this);
    if (voice1.patchStates[activePage][$this.attr("id")] == 1) {
      if (activePage == "ratButton") {
        voice1.lfoGainDict[activePage].disconnect(voice1.oscNodeDictP[$this.attr("id")]);
      } else if (activePage == "oscButton" || activePage == "ofxButton") {
        voice1.lfoGainDict[activePage].disconnect(voice1.modDestDict[activePage][$this.attr("id")]);
      } else if (activePage == "panButton") {
        voice1.lfoGainDict[activePage].disconnect(voice1.oscPanModDict[$this.attr("id")]);
      } else if (activePage == "ampButton") {
        voice1.lfoGainDict[activePage].disconnect(voice1.envModDict[$this.attr("id")]);
      } else if (activePage == "revButton") {
        voice1.lfoGainDict[activePage].disconnect(voice1.crushRateDict[patchConv2[$this.attr("id")]]);
        voice1.lfoGainDict[activePage].disconnect(voice1.crushDepthDict[patchConv2[$this.attr("id")]]);
      }
      voice1.patchStates[activePage][$this.attr("id")] = 0;
      $this.css("opacity", "33%");
      $this.removeClass("selected");
    } else if (voice1.patchStates[activePage][$this.attr("id")] == 0) {
      if (activePage == "ratButton") {
        voice1.lfoGainDict[activePage].connect(voice1.oscNodeDictP[$this.attr("id")]);
      } else if (activePage == "oscButton" || activePage == "ofxButton") {
        voice1.lfoGainDict[activePage].connect(voice1.modDestDict[activePage][$this.attr("id")]);
      } else if (activePage == "panButton") {
        voice1.lfoGainDict[activePage].connect(voice1.oscPanModDict[$this.attr("id")]);
      } else if (activePage == "ampButton") {
        voice1.lfoGainDict[activePage].connect(voice1.envModDict[$this.attr("id")]);
      } else if (activePage == "revButton") {
        voice1.lfoGainDict[activePage].connect(voice1.crushRateDict[patchConv2[$this.attr("id")]]);
        voice1.lfoGainDict[activePage].connect(voice1.crushDepthDict[patchConv2[$this.attr("id")]]);
      }
      voice1.patchStates[activePage][$this.attr("id")] = 1;
      $this.css("opacity", "100%");
      $this.addClass("selected");
    }
  });

  $(".modeSelect").click(function() {
    let $this = $(this);
    let $currentMode = $("#" + voice1.modeStates[activePage]);
    if (!$this.hasClass("selected")) {
      $currentMode.removeClass("selected");
      $currentMode.css("opacity", "50%");
      voice1.modeStates[activePage] = $this.attr("id");
      $this.addClass("selected");
      $this.css("opacity", "100%");
      let currentLFORatio = voice1.ratioDict[voice1.lfoVals[activePage]["lfoS1"]];
      if (voice1.modeStates[activePage] == "MS1") { //mode 1 - fixed base
        aRateModDict = aRateModDict.filter(page => page != activePage); //remove active page
        bpmModDict = bpmModDict.filter(page => page != activePage);     //from both mod dicts
        voice1.lfoFreqDict[activePage] = 8.0; //set current LFO base to fixed frequency
      } else if (voice1.modeStates[activePage] == "MS2") { //mode 2 - tempo base
        bpmModDict.push(activePage); //add current page to audio rate mod dict
        aRateModDict = aRateModDict.filter(page => page != activePage); //remove active page from aRate mod dict
        voice1.lfoFreqDict[activePage] = bpm/60.0; //set current LFO base to 1/60th BPM (quarter notes per second)
      } else if (voice1.modeStates[activePage] == "MS3") { //mode 3 - fundamental base
        aRateModDict.push(activePage); //add current page to bpm mod dict
        bpmModDict = bpmModDict.filter(page => page != activePage); //remove active page from bpm mod dict
        voice1.lfoFreqDict[activePage] = voice1.fundamental; //set current LFO base to fundamental frequency
      }
      let newLFOFreq = voice1.lfoFreqDict[activePage]*currentLFORatio; //calc new LFO freq
      voice1.lfoNodeDict[activePage].frequency.setTargetAtTime(newLFOFreq, synthCtx.currentTime, .0005); //set freq
      $lfoInfo2["base"].html("base: " + voice1.lfoFreqDict[activePage].toFixed(2) + "Hz");
      $lfoInfo2["freq"].html("freq: " + newLFOFreq.toFixed(2) + "Hz");
    }
  });
});
