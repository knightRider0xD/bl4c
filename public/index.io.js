
var socket = 0;
var hmc = 0;
var panStart = [0,0];
var ptz = {camera:1, pan:0, tilt:0, zoom:0};
var lastMouse = {clientY:-1};

var atemStatus = {program:0,preview:0,aux:0,ftb:0,transLength:0.6,audioChannels:[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]]};
var enableALvls = 0;
var transStyle = '';
var atemALvl = {audioLevels:[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]]};
                        
var recorderStatus = {connected:0,recording:0,remainingSpace:'Remaining&nbsp;Space&nbsp;Unavailable'};
var mplayerStatus = {connected:0,playing:0};
var publisherStatus = {status:0,complete:0,lastDiscStatus:0,lastFileStatus:0};
var volFaderMouseDown = 0;

guiElements = {
    main:0,
    mainPages:[],
    mainTabs:[],
    progBtns:[],
    prevBtns:[],
    auxBtns:[],
    transLengthNumeric:0,
    aMixers:[{name:"master",channel:0,mute:1,volume:0,vol_bar:0,level:[],ref:[]},
    {name:"ch1",channel:1,mute:1,volume:0,vol_bar:0,level:[],ref:[]},
    {name:"ch2",channel:2,mute:1,volume:0,vol_bar:0,level:[],ref:[]},
    {name:"ch3",channel:3,mute:1,volume:0,vol_bar:0,level:[],ref:[]},
    {name:"ch4",channel:4,mute:1,volume:0,vol_bar:0,level:[],ref:[]}],
    recordBtn:0,
    stopBtn:0,
    publishBtn:0,
    recordSpaceRemain:0,
    recordStatus:0,
    settings:0,
    mediaPlay:0,
    mediaPause:0,
    mediaStop:0,
    mediaSelect:0,
    mediaTitle:0,
    mediaStartPosM:0,
    mediaStartPosS:0,
    ptzZoomLvl:0,
    ptzHitarea:0,
    ptzBoundBox:0,
    ptzCams:[],
    
    publish:0,
    publishPages:[],
    publishTabs:[],
    controlContainer:0,
    progressContainer:0,
    sourceFileList:0,
    publishCopyBtn:0,
    publishDeleteBtn:0,
    publishFileList:0,
    burnerStartBtn:0,
    burnerResumeBtn:0,
    fileStartBtn:0,
    fileResumeBtn:0,
    uploadURI:0,
    uploadUser:0,
    uploadPwd:0,
    uploadOutName:0,
    uploadStartBtn:0,
    uploadResumeBtn:0,
    progressText:0,
    currentProgress:0
}

function main(){
    
    guiElements.publish.style.display = "none";
    guiElements.main.style.display = "block";
    
    enableALvls = 1;
    
}

function publish(){
    
    guiElements.main.style.display = "none";
    guiElements.publish.style.display = "block";
    
    enableALvls = 0;
    atemALvl = {audioLevels:[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]]};
    
    socket.emit('getFileList');
    
}

function onAtemUpdate(status){
    atemStatus = status;
    //console.log(status);
    
    guiProgramSwitcher(); //set program
    guiPreviewSwitcher(); //set preview
    guiAuxSwitcher(); //set aux
    guiTransLength(); //set translength
    for (var i = 0; i < guiElements.aMixers.length; i++) {
        guiAudioChannel(i); // Update audio mixer volumes for each mixer
    }
}


function onAtemAudioLevel(levels){
    
    if(enableALvls) {
        atemALvl = levels;
        
        for (var i = 0; i < guiElements.aMixers.length; i++) {
            guiAudioLevel(i); // Update audio mixer levels for each mixer
        }
    }
}

function onRecorderUpdate(status){
    recorderStatus = status;
    //console.log(status);
    
    guiRecord(); //set record
    
}

function onMplayerUpdate(status){
    mplayerStatus = status;
    //console.log(status);
    
    guiMplayer(); //set record
    
}

function onPublisherUpdate(status){
    publisherStatus = status;
    //console.log(status);
    
    guiRecord(); //set record
    guiPublishProgress(); //set publish
    
}


function setAtemProgram(input){
    socket.emit('atem_changeProgram', {input:input,trans:transStyle});
}

function setAtemPreview(input){
    socket.emit('atem_setPreview', input);
}

function setAtemAux(input){
    socket.emit('atem_setAux', input);
}

function setAtemTransLength(){
    socket.emit('atem_setTransLength', guiElements.transLengthNumeric.value/1000);
}

function setAtemTransition(){
    
}


function setAtemAudioMute(mixer){
    
    var chnl = parseInt(guiElements.aMixers[mixer].channel);
    if(chnl>8){
        switch (chnl) {
        case 1001:
            chnl = 11;
            break;
        case 1101:
            chnl = 12;
            break;
        case 1201:
            chnl = 13;
            break;
        case 2001:
            chnl = 14;
            break;
        case 2002:
            chnl = 15;
            break;
        }
    }
    
    socket.emit('atem_setAudioMute', {channel:guiElements.aMixers[mixer].channel,mute:(atemStatus.audioChannels[chnl][0]+1)%2});
}

/////////////////////////////////////////////
function absorbEvent_(event) {
    var e = event || window.event;
    e.preventDefault && e.preventDefault();
    e.stopPropagation && e.stopPropagation();
    e.cancelBubble = true;
    e.returnValue = false;
    return false;
}

function preventLongPressMenu(node) {
    node.ontouchstart = absorbEvent_;
    node.ontouchmove = absorbEvent_;
    node.ontouchend = absorbEvent_;
    node.ontouchcancel = absorbEvent_;
}

/* OLD VOLUME FUNCTION *
function setAtemAudioVolume(mixer){
    socket.emit('atem_setAudioVolume', {channel:guiElements.aMixers[mixer].channel,volume:guiElements.aMixers[mixer].volume.value});
}
*/

function volInitChange(ev, mixer){
    volFaderMouseDown = mixer;
    lastMouse.clientY = -1;
    volChange(ev, mixer);
}

function volChange(ev, mixer){
    
    if(volFaderMouseDown!=mixer || lastMouse.clientY == ev.clientY){
        return;
    }
    
    guiElements.aMixers[mixer].volume.style.top = (ev.offsetY-(guiElements.aMixers[mixer].volume.offsetHeight/2))+'px';
    
    var faderPosPercent = ev.offsetY/(guiElements.aMixers[mixer].vol_bar.offsetHeight);
    var linScaledPercent = 0.24-(faderPosPercent*1.25); // Gives a value from +0.24 to -1
    var logScaledVol = 60*Math.pow(Math.abs(linScaledPercent),1.6); // Scales this to an abs value for the range between +6 and -60dB
    if(linScaledPercent<0){
        logScaledVol *= -1; // Flips a scaled volume back to negative if it was a negative percent
    }
    //var linerVol = Math.round(6-(faderPosPercent*67));

    socket.emit('atem_setAudioVolume', {channel:guiElements.aMixers[mixer].channel,volume:logScaledVol});
    console.log('Mixer '+mixer+': '+logScaledVol);
    lastMouse = ev;
}

function volEndChange(){
    var mixer = volFaderMouseDown;
    volFaderMouseDown = -1;
    guiAudioChannel(mixer);
}

function volInitChange_Master(ev){
    volInitChange(ev,0);
}

function volInitChange_1(ev){
    volInitChange(ev,1);
}

function volInitChange_2(ev){
    volInitChange(ev,2);
}

function volInitChange_3(ev){
    volInitChange(ev,3);
}

function volInitChange_4(ev){
    volInitChange(ev,4);
}

function volChange_Master(ev){
    volChange(ev,0);
}

function volChange_1(ev){
    volChange(ev,1);
}

function volChange_2(ev){
    volChange(ev,2);
}

function volChange_3(ev){
    volChange(ev,3);
}

function volChange_4(ev){
    volChange(ev,4);
}

function runAtemAudioPreset(preset){
    socket.emit('atem_runAudioPreset', preset);
}

function record(){
    socket.emit('record',1);
}

function stopRecord(){
    socket.emit('record',0);
}

function playMedia(){
    
    var media = guiElements.mediaSelect.options[guiElements.mediaSelect.selectedIndex].value;
    
    if(guiElements.mediaSelect.selectedIndex == 0){
        return; // nothing selected
    } else if(media=='recstream'){
        media = 'http://192.168.10.232:5000/ :network-caching=200';
        //media = '/home/ian/video-system/Lindsey-Stirling-Elements.mp4 :start-time='+((parseInt(guiElements.mediaStartPosM.value)*60)+parseInt(guiElements.mediaStartPosS.value));
    } else if(media=='bluray'){
        media = 'bluray:///dev/sr0#'+guiElements.mediaTitle.value+' :disc-caching=300 :start-time='+((parseInt(guiElements.mediaStartPosM.value)*60)+parseInt(guiElements.mediaStartPosS.value));
    } else if(media=='dvd'){
        media = 'dvdsimple:///dev/sr0#'+guiElements.mediaTitle.value+' :disc-caching=300 :start-time='+((parseInt(guiElements.mediaStartPosM.value)*60)+parseInt(guiElements.mediaStartPosS.value));
    } else if(media=='vcd'){
        media = 'vcd:///dev/sr0#'+guiElements.mediaTitle.value+' :disc-caching=300 :start-time='+((parseInt(guiElements.mediaStartPosM.value)*60)+parseInt(guiElements.mediaStartPosS.value));
    } else if(media=='cdda'){
        media = 'cdda:///dev/sr0 :cdda-track='+guiElements.mediaTitle.value+' :disc-caching=300 :start-time='+((parseInt(guiElements.mediaStartPosM.value)*60)+parseInt(guiElements.mediaStartPosS.value));
    } else {
        media = media + ' :start-time='+((parseInt(guiElements.mediaStartPosM.value)*60)+parseInt(guiElements.mediaStartPosS.value));
    }
    
    //console.log(media);
    socket.emit('playMedia', media);
}
    
function pauseMedia(){
    socket.emit('pauseMedia');
}
    
function stopMedia(){
    socket.emit('stopMedia');
}

/**
 * Sets the Active PTZ Camera
 */
function guiPTZCameraSwitcher(cam){
    
    var length = guiElements.ptzCams.length;
    ptz.camera = cam
    
    for (var i = 0; i < length; i++) {
        if(i==cam-1){
            guiElements.ptzCams[i].className = "ptzCamTab active";
        } else {
            guiElements.ptzCams[i].className = "ptzCamTab";
        }
    }
    
}

/**
 * Updates the interface's tabs/pages
 */
function guiMainPageSwitcher(page){
    
    var length = (guiElements.mainPages.length < guiElements.mainTabs.length) ? guiElements.mainPages.length : guiElements.mainTabs.length;
    
    for (var i = 0; i < length; i++) {
        if(i==page){
            guiElements.mainTabs[i].className = "indexTab active";
            guiElements.mainPages[i].style.display = "block";
        } else {
            guiElements.mainTabs[i].className = "indexTab";
            guiElements.mainPages[i].style.display = "none";
        }
    }
    
    if(page==1){
        enableALvls = 1;
    } else {
        enableALvls = 0;
        atemALvl = {audioLevels:[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]]};
    }
    
}

/**
 * Updates the interface's program chooser
 */
function guiProgramSwitcher(){
    
    for (var i = 0; i < guiElements.progBtns.length; i++) {
        guiElements.progBtns[i].className = guiElements.progBtns[i].className.replace( /(?:^|\s)btn-danger(?!\S)/g , ' btn-prog ' ); //clear program
    }
    
    if(atemStatus.program >= 0 && atemStatus.program <= 8){
        guiElements.progBtns[atemStatus.program].className = guiElements.progBtns[atemStatus.program].className.replace( /(?:^|\s)btn-prog(?!\S)/g , ' btn-danger ' ); //set program
    } else if(atemStatus.program == 2001){
        guiElements.progBtns[9].className = guiElements.progBtns[9].className.replace( /(?:^|\s)btn-prog(?!\S)/g , ' btn-danger ' ); //set program
    } else if(atemStatus.program == 2002){
        guiElements.progBtns[10].className = guiElements.progBtns[10].className.replace( /(?:^|\s)btn-prog(?!\S)/g , ' btn-danger ' ); //set program
    }
}

/**
 * Updates the interface's preview chooser
 */
function guiPreviewSwitcher(){
    
    for (var i = 0; i < guiElements.prevBtns.length; i++) {
        guiElements.prevBtns[i].className = guiElements.prevBtns[i].className.replace( /(?:^|\s)btn-success(?!\S)/g , ' btn-prev ' ); //clear preview
    }
    
    if(atemStatus.preview >= 0 && atemStatus.preview <= 8){
        guiElements.prevBtns[atemStatus.preview].className = guiElements.prevBtns[atemStatus.preview].className.replace( /(?:^|\s)btn-prev(?!\S)/g , ' btn-success ' ); //set preview
    } else if(atemStatus.preview == 2001){
        guiElements.prevBtns[9].className = guiElements.prevBtns[9].className.replace( /(?:^|\s)btn-prev(?!\S)/g , ' btn-success ' ); //set preview
    } else if(atemStatus.preview == 2002){
        guiElements.prevBtns[10].className = guiElements.prevBtns[10].className.replace( /(?:^|\s)btn-prev(?!\S)/g , ' btn-success ' ); //set preview
    }
}

/**
 * Updates the interface's aux chooser
 */
function guiAuxSwitcher(){
    
    for (var i = 0; i < guiElements.auxBtns.length; i++) {
        guiElements.auxBtns[i].className = guiElements.auxBtns[i].className.replace( /(?:^|\s)btn-warning(?!\S)/g , ' btn-aux ' ); //clear aux
    }
    
    if(atemStatus.aux >= 0 && atemStatus.aux <= 8){
        guiElements.auxBtns[atemStatus.aux].className = guiElements.auxBtns[atemStatus.aux].className.replace( /(?:^|\s)btn-aux(?!\S)/g , ' btn-warning ' ); //set aux
    } else if(atemStatus.aux == 2001){
        guiElements.auxBtns[9].className = guiElements.auxBtns[9].className.replace( /(?:^|\s)btn-aux(?!\S)/g , ' btn-warning ' ); //set aux
    } else if(atemStatus.aux == 2002){
        guiElements.auxBtns[10].className = guiElements.auxBtns[10].className.replace( /(?:^|\s)btn-aux(?!\S)/g , ' btn-warning ' ); //set aux
    } else if(atemStatus.aux == 10010){
        guiElements.auxBtns[11].className = guiElements.auxBtns[11].className.replace( /(?:^|\s)btn-aux(?!\S)/g , ' btn-warning ' ); //set aux
    }
}

/**
 * Sets Auto Transition Effect & Delay
 */
function guiAutoTransSwitcher(trans){
    
    var length = guiElements.transStyleRadios.length;
    transStyle = trans
    
    if(guiElements.transStyleRadios.length==3){
        if(trans=='cut'){
            guiElements.transStyleRadios[1].className = "transStyle active";
            guiElements.transStyleRadios[0].className = "transStyle";
            guiElements.transStyleRadios[2].className = "transStyle";
        } else if (trans=='mix'){
            guiElements.transStyleRadios[2].className = "transStyle active";
            guiElements.transStyleRadios[0].className = "transStyle";
            guiElements.transStyleRadios[1].className = "transStyle";
        } else {
            guiElements.transStyleRadios[0].className = "transStyle active";
            guiElements.transStyleRadios[1].className = "transStyle";
            guiElements.transStyleRadios[2].className = "transStyle";
        }
    }
    
}

/**
 * Updates one of the interface's audio channels based on gui setting
 */
function guiAudioChannel(mixer){
    if(mixer>0){
        var chnl = parseInt(guiElements.aMixers[mixer].name.options[guiElements.aMixers[mixer].name.selectedIndex].value);
        guiElements.aMixers[mixer].channel = chnl;
        
        if(chnl>8){
            switch (chnl) {
            case 1001:
                chnl = 11;
                break;
            case 1101:
                chnl = 12;
                break;
            case 1201:
                chnl = 13;
                break;
            case 2001:
                chnl = 14;
                break;
            case 2002:
                chnl = 15;
                break;
            }
        }
    
        //Set mute
        if (atemStatus.audioChannels[chnl][0]){
            guiElements.aMixers[mixer].mute.className = guiElements.aMixers[mixer].mute.className.replace( /(?:^|\s)btn-default(?!\S)/g , ' btn-success ' ); //on
            guiElements.aMixers[mixer].mute.innerHTML = 'LIVE';
            //level colours left
            guiElements.aMixers[mixer].ref[0].className = guiElements.aMixers[mixer].ref[0].className.replace( /(?:^|\s)volume-bar-normal-muted(?!\S)/g , ' volume-bar-normal ' ); //green
            guiElements.aMixers[mixer].ref[1].className = guiElements.aMixers[mixer].ref[1].className.replace( /(?:^|\s)volume-bar-high-muted(?!\S)/g , ' volume-bar-high ' ); //amber
            guiElements.aMixers[mixer].ref[2].className = guiElements.aMixers[mixer].ref[2].className.replace( /(?:^|\s)volume-bar-over-muted(?!\S)/g , ' volume-bar-over ' ); //red
            //level colours right
            guiElements.aMixers[mixer].ref[3].className = guiElements.aMixers[mixer].ref[3].className.replace( /(?:^|\s)volume-bar-normal-muted(?!\S)/g , ' volume-bar-normal ' ); //green
            guiElements.aMixers[mixer].ref[4].className = guiElements.aMixers[mixer].ref[4].className.replace( /(?:^|\s)volume-bar-high-muted(?!\S)/g , ' volume-bar-high ' ); //amber
            guiElements.aMixers[mixer].ref[5].className = guiElements.aMixers[mixer].ref[5].className.replace( /(?:^|\s)volume-bar-over-muted(?!\S)/g , ' volume-bar-over ' ); //red
        } else {
            guiElements.aMixers[mixer].mute.className = guiElements.aMixers[mixer].mute.className.replace( /(?:^|\s)btn-success(?!\S)/g , ' btn-default ' ); //mute
            guiElements.aMixers[mixer].mute.innerHTML = '<span style="color: red; font-weight: bold;">MUTED</span>';
            //level colours left
            guiElements.aMixers[mixer].ref[0].className = guiElements.aMixers[mixer].ref[0].className.replace( /(?:^|\s)volume-bar-normal(?!\S)/g , ' volume-bar-normal-muted ' ); //grey
            guiElements.aMixers[mixer].ref[1].className = guiElements.aMixers[mixer].ref[1].className.replace( /(?:^|\s)volume-bar-high(?!\S)/g , ' volume-bar-high-muted ' ); //lighter grey
            guiElements.aMixers[mixer].ref[2].className = guiElements.aMixers[mixer].ref[2].className.replace( /(?:^|\s)volume-bar-over(?!\S)/g , ' volume-bar-over-muted ' ); //dark grey
            //level colours right
            guiElements.aMixers[mixer].ref[3].className = guiElements.aMixers[mixer].ref[3].className.replace( /(?:^|\s)volume-bar-normal(?!\S)/g , ' volume-bar-normal-muted ' ); //grey
            guiElements.aMixers[mixer].ref[4].className = guiElements.aMixers[mixer].ref[4].className.replace( /(?:^|\s)volume-bar-high(?!\S)/g , ' volume-bar-high-muted ' ); //lighter grey
            guiElements.aMixers[mixer].ref[5].className = guiElements.aMixers[mixer].ref[5].className.replace( /(?:^|\s)volume-bar-over(?!\S)/g , ' volume-bar-over-muted ' ); //dark grey
        }
        
        // Update mixer fader position (except if the user is interacting with the volume fader for this mixer)
        if(volFaderMouseDown!=(mixer)){
            
            var linScaledPercent = Math.pow(Math.abs(atemStatus.audioChannels[chnl][1]/60),0.625); // Gives a value from +0.24 to -1
            if(atemStatus.audioChannels[chnl][1]<0){
                linScaledPercent *= -1; // Flips a volume percent back to negative if it was from a negative value
            }
            var faderPosPercent = (linScaledPercent-0.24)*-0.8; 
            
            guiElements.aMixers[mixer].volume.style.top = (faderPosPercent*guiElements.aMixers[mixer].vol_bar.offsetHeight)+'px';
            
            //var linerVol = Math.round(6-(faderPosPercent*67));
            
            //guiElements.aMixers[mixer].volume.style.top = (((atemStatus.audioChannels[chnl][1]-6)/-66)*guiElements.aMixers[mixer].vol_bar.offsetHeight)+'px';
        }
        
    } else {
        // Update master fader position (except if the user is interacting with the master volume fader)
        if(volFaderMouseDown!=(0)){
            
            var linScaledPercent = Math.pow(Math.abs(atemStatus.audioChannels[0][1]/60),0.625); // Gives a value from +0.24 to -1
            if(atemStatus.audioChannels[0][1]<0){
                linScaledPercent *= -1; // Flips a volume percent back to negative if it was from a negative value
            }
            var faderPosPercent = (linScaledPercent-0.24)*-0.8; 
            
            guiElements.aMixers[0].volume.style.top = (faderPosPercent*guiElements.aMixers[0].vol_bar.offsetHeight)+'px';
            
            //var linerVol = Math.round(6-(faderPosPercent*67));
            
            //guiElements.aMixers[0].volume.style.top = (((atemStatus.audioChannels[0][1]-6)/-66)*guiElements.aMixers[0].vol_bar.offsetHeight)+'px';
            
        }
    }
    
}

/**
 * Updates one of the interface's audio levels
 */
function guiAudioLevel(mixer){
    if(mixer>0){
        var chnl = guiElements.aMixers[mixer].channel;
        
        if(chnl>8){
            switch (chnl) {
            case 1001:
                chnl = 11;
                break;
            case 1101:
                chnl = 12;
                break;
            case 1201:
                chnl = 13;
                break;
            case 2001:
                chnl = 14;
                break;
            case 2002:
                chnl = 15;
                break;
            }
        }
        
        //Set level
        var linScaledPercentL = Math.pow(Math.abs(atemALvl.audioLevels[chnl][0]/60),0.625);
        var linScaledPercentR = Math.pow(Math.abs(atemALvl.audioLevels[chnl][1]/60),0.625);
        guiElements.aMixers[mixer].level[0].style = "height:"+(linScaledPercentL*80)+"%;";
        guiElements.aMixers[mixer].level[1].style = "height:"+(linScaledPercentR*80)+"%;";
        
        //guiElements.aMixers[mixer].level[0].style = "height:"+(atemALvl.audioLevels[chnl][0]*-1.1)+"%;";
        //guiElements.aMixers[mixer].level[1].style = "height:"+(atemALvl.audioLevels[chnl][1]*-1.1)+"%;";
    } else if (mixer==0){
        
        var linScaledPercentL = Math.pow(Math.abs(atemALvl.audioLevels[0][0]/60),0.625);
        var linScaledPercentR = Math.pow(Math.abs(atemALvl.audioLevels[0][1]/60),0.625);
        guiElements.aMixers[0].level[0].style = "height:"+(linScaledPercentL*80)+"%;";
        guiElements.aMixers[0].level[1].style = "height:"+(linScaledPercentR*80)+"%;";
        
        //guiElements.aMixers[0].level[0].style = "height:"+(atemALvl.audioLevels[0][0]*-1.1)+"%;";
        //guiElements.aMixers[0].level[1].style = "height:"+(atemALvl.audioLevels[0][1]*-1.1)+"%;";
    }
    
}

function guiTransLength(){
    guiElements.transLengthNumeric.value = atemStatus.transLength;
}

//recorder stuff

/**
 * Updates the interface's record buttons
 */
function guiRecord(){
    
    if(recorderStatus.connected<=0){
        guiElements.recordSpaceRemain.innerHTML = "<b>Recording Space:</b> "+recorderStatus.remainingSpace;
        guiElements.recordStatus.innerHTML = "<b>Recorder Offline</b>";
        guiElements.recordBtn.className = guiElements.recordBtn.className.replace( /(?:^|\s)btn-danger(?!\S)/g , ' btn-default ' );
        guiElements.recordBtn.innerHTML = 'RECORD';
        guiElements.publishBtn.className = guiElements.publishBtn.className.replace( /(?:^|\s)btn-primary(?!\S)/g , ' btn-default ' );
        guiElements.publishBtn.innerHTML = 'PUBLISH';
        guiElements.publishBtn.disabled = false;
        guiElements.recordBtn.disabled = true;
        guiElements.stopBtn.disabled = true;
    } else if(recorderStatus.recording){
        guiElements.recordSpaceRemain.innerHTML = "<b>Recording Space:</b> Unavailable&nbsp;while&nbsp;recording";
        guiElements.recordStatus.innerHTML = "<b>Currently Recording</b>";
        guiElements.recordBtn.className = guiElements.recordBtn.className.replace( /(?:^|\s)btn-default(?!\S)/g , ' btn-danger ' );
        guiElements.recordBtn.innerHTML = 'NOW RECORDING';
        guiElements.publishBtn.className = guiElements.publishBtn.className.replace( /(?:^|\s)btn-primary(?!\S)/g , ' btn-default ' );
        guiElements.publishBtn.disabled = true;
        guiElements.stopBtn.disabled = false;
        guiElements.recordBtn.disabled = true;
    } else if(publisherStatus.status!=0){
        guiElements.recordSpaceRemain.innerHTML = "<b>Recording Space:</b> "+recorderStatus.remainingSpace;
        guiElements.recordStatus.innerHTML = "<b>Unable to Record</b> (Publishing)";
        guiElements.recordBtn.className = guiElements.recordBtn.className.replace( /(?:^|\s)btn-danger(?!\S)/g , ' btn-default ' );
        guiElements.recordBtn.innerHTML = 'RECORD';
        guiElements.publishBtn.className = guiElements.publishBtn.className.replace( /(?:^|\s)btn-default(?!\S)/g , ' btn-primary ' );
        guiElements.publishBtn.innerHTML = 'PUBLISHING';
        guiElements.publishBtn.disabled = true;
        guiElements.stopBtn.disabled = true;
        guiElements.recordBtn.disabled = true;
    } else {
        guiElements.recordSpaceRemain.innerHTML = "<b>Recording Space:</b> "+recorderStatus.remainingSpace;
        guiElements.recordStatus.innerHTML = "<b>Currently Recording</b>";
        guiElements.recordBtn.className = guiElements.recordBtn.className.replace( /(?:^|\s)btn-danger(?!\S)/g , ' btn-default ' );
        guiElements.recordBtn.innerHTML = 'RECORD';
        guiElements.publishBtn.className = guiElements.publishBtn.className.replace( /(?:^|\s)btn-primary(?!\S)/g , ' btn-default ' );
        guiElements.publishBtn.innerHTML = 'PUBLISH';
        guiElements.publishBtn.disabled = false;
        guiElements.recordBtn.disabled = false;
        guiElements.stopBtn.disabled = true;
    }
    
    
}

/**
 * Updates the interface's mplayer buttons
 */
function guiMplayer(){
    
    if(mplayerStatus.playing==0){
        guiElements.mediaPause.disabled = true;
        guiElements.mediaPause.innerHTML = '<span class="glyphicon glyphicon-pause" aria-hidden="true"></span>&nbsp;PAUSE PLAYBACK&nbsp;';
    } else if(mplayerStatus.playing==1){
        guiElements.mediaPause.disabled = false;
        guiElements.mediaPause.innerHTML = '<span class="glyphicon glyphicon-pause" aria-hidden="true"></span>&nbsp;PAUSE PLAYBACK&nbsp;';
    } else if(mplayerStatus.playing==2){
        guiElements.mediaPause.disabled = false;
        guiElements.mediaPause.innerHTML = '<span class="glyphicon glyphicon-play" aria-hidden="true"></span>&nbsp;RESUME PLAYBACK';
    }
    
}


//camera stuff

function ptzReset(){

    guiElements.ptzZoomLvl.value = 0;
    guiElements.ptzHitarea.style.left = ((guiElements.ptzBoundBox.clientWidth/2) - 30) + 'px';
    guiElements.ptzHitarea.style.top  = ((guiElements.ptzBoundBox.clientHeight/2) - 30) + 'px';
    socket.emit('visca_sendPtzCmd', {camera:ptz.camera,pan:0,tilt:0,zoom:0});
    console.log('PTZ reset');
    
}

function ptzZoom(){
    
    var zoom  = guiElements.ptzZoomLvl.value;

    if(zoom!=ptz.zoom){
        ptz.zoom = zoom;
        socket.emit('visca_sendPtzCmd', {camera:ptz.camera,
                                    pan:0,
                                    tilt:0,
                                    zoom:ptz.zoom});
        console.log({camera:ptz.camera,
                                    pan:0,
                                    tilt:0,
                                    zoom:ptz.zoom});
    }
    
}

function ptzInitPan(ev){
    ev.preventDefault();
        panStart[0] = guiElements.ptzHitarea.getBoundingClientRect().left - guiElements.ptzBoundBox.getBoundingClientRect().left;
    panStart[1] = guiElements.ptzHitarea.getBoundingClientRect().top  - guiElements.ptzBoundBox.getBoundingClientRect().top;
    ptzPan(ev);
}

function ptzPan(ev){
    
    ev.preventDefault();
        guiElements.ptzHitarea.style.left = (panStart[0] + ev.deltaX) + 'px';
    guiElements.ptzHitarea.style.top  = (panStart[1] + ev.deltaY) + 'px';
    
    var pan = Math.round((ev.deltaX/(guiElements.ptzBoundBox.clientWidth/2))*12.0);
    var tilt = Math.round((ev.deltaY/(guiElements.ptzBoundBox.clientHeight/2))*-10.0);

    if(pan!=ptz.pan || tilt!=ptz.tilt){
        ptz.pan = pan;
        ptz.tilt = tilt;

        socket.emit('visca_sendPtzCmd', {camera:ptz.camera,
                                    pan:ptz.pan,
                                    tilt:ptz.tilt,
                                    zoom:0});

        console.log( {camera:ptz.camera,
                                    pan:ptz.pan,
                                    tilt:ptz.tilt,
                                    zoom:0});
    }

}

function ptzRecallPreset(preset){
    socket.emit('visca_sendPtzRecall', {camera:ptz.camera,
                                slot:preset});
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function onFileList(list){
    
    // Clear list
    while (sourceFileList.options.length>0) {
        sourceFileList.remove(0);
    }
    
    // Write new elements
    for (var i = 0; i < list.length; i++) {
        var opt = document.createElement("option");
        opt.innerHTML = list[i];
        // Append it to the select element
        sourceFileList.add(opt,0);
    }
    
}

/**
 * Updates the interface's tabs/pages
 */
function guiPublishPageSwitcher(page){
    
    var length = (guiElements.publishPages.length < guiElements.publishTabs.length) ? guiElements.publishPages.length : guiElements.publishTabs.length;
    
    for (var i = 0; i < length; i++) {
        if(i==page){
            guiElements.publishTabs[i].className = "publishTab active";
            guiElements.publishPages[i].style.display = "block";
        } else {
            guiElements.publishTabs[i].className = "publishTab";
            guiElements.publishPages[i].style.display = "none";
        }
    }
    
}

/**
 * Updates the interface's program chooser
 */
function guiPublishProgress(){
    
    if(publisherStatus.status==0){
        guiElements.controlContainer.style = "";
        guiElements.progressContainer.style = "display:none;";
    } else {
        guiElements.controlContainer.style = "display:none;";
        guiElements.progressContainer.style = "";
        
        guiElements.currentProgress.style = "width:"+(publisherStatus.complete*100)+"%;";
        guiElements.progressText.innerHTML = publisherStatus.status;
    }
    
    if(publisherStatus.lastDiscStatus==3) {
        guiElements.burnerResumeBtn.removeAttribute("disabled");
        guiElements.burnerResumeBtn.innerHTML = '<span class="glyphicon glyphicon-repeat" aria-hidden="true"></span>&nbsp;COPY LAST'
    } else if(publisherStatus.lastDiscStatus>0){
        guiElements.burnerResumeBtn.removeAttribute("disabled");
        guiElements.burnerResumeBtn.innerHTML = '<span class="glyphicon glyphicon-play-circle" aria-hidden="true"></span>&nbsp;RESUME LAST'
    } else {
        guiElements.burnerResumeBtn.setAttribute("disabled","true");
        guiElements.burnerResumeBtn.innerHTML = '<span class="glyphicon glyphicon-ban-circle" aria-hidden="true"></span>&nbsp;RESUME/COPY'
    }
    
}

//burner stuff

function copyToPublishList(){
    
    // Iterate over options
    for (var i=0; i<sourceFileList.options.length; i++) {
        
        // check if selected
        if ( sourceFileList.options[i].selected ) {
            // if yes, copy to publish list
            var opt = document.createElement("option");
            opt.innerHTML = sourceFileList.options[i].innerHTML;
            guiElements.publishFileList.add(opt);
        }
    }
    
}

function deleteFromPublishList(){
    
    for (var i=0; i<guiElements.publishFileList.options.length; i++) {
        
        // check if selected
        if ( guiElements.publishFileList.options[i].selected ) {
            // if yes, remove from publish list
            var opt = document.createElement("option");
            opt.innerHTML = sourceFileList.options[i].innerHTML;
            guiElements.publishFileList.remove(i);
            return;
        }
    }
}

function burnDisc(resume){
    var fileList = [];
    for (var i=0; i<guiElements.publishFileList.options.length; i++) {
        fileList.push(guiElements.publishFileList.options[i].value);
    }
    
    socket.emit('burnDisc', {resume:resume, sourceFNames:fileList});
}

function uploadFile(resume){
    var fileList = [];
    for (var i=0; i<guiElements.publishFileList.options.length; i++) {
        fileList.push(guiElements.publishFileList.options[i].value);
    }
    
    socket.emit('uploadFile', {resume:resume, sourceFNames:fileList,destFName:guiElements.uploadOutName.value,transcode:true,server:guiElements.uploadURI.value,username:guiElements.uploadUser.value,password:guiElements.uploadPwd.value});
}

function copyFile(resume){
    var fileList = [];
    for (var i=0; i<guiElements.publishFileList.options.length; i++) {
        fileList.push(guiElements.publishFileList.options[i].value);
    }
    
    socket.emit('copyFile', {resume:resume, sourceFNames:fileList,destFName:guiElements.uploadOutName.value,transcode:true,server:guiElements.uploadURI.value,username:guiElements.uploadUser.value,password:guiElements.uploadPwd.value});
}

function cancelPublish(){
    socket.emit('cancelPublish');
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


/**
 * Opens a socket.io connection back to the server
 * requires socket.io client library to already be loaded
 */
function connectServer(){
    //setup socket
    socket = new io.connect( {
        'reconnection': true,
        'reconnectionDelay': 1000,
        'reconnectionDelayMax' : 5000,
    'reconnectionAttempts': Number.MAX_VALUE
    });    

    //connect socket events
    socket.on("connect", function () {console.log("Connected!");});
    socket.on("atem_update", function (status) {onAtemUpdate(status);});
    socket.on("atem_alvls", function (levels) {onAtemAudioLevel(levels);});
    socket.on("recorder_update", function (status) {onRecorderUpdate(status);});
    socket.on("mplayerUpdate", function (status) {onMplayerUpdate(status);});
    socket.on("publisher_update", function (status) {onPublisherUpdate(status);});
    socket.on("publisher_fileList", function (list) {console.log(list); onFileList(list);});
}

/**
 * Closes sio connection.
 */
window.onbeforeunload = function(e) {
    socket.disconnect();
};

/**
 * Connects GUI elements to vars for easy access
 */
function connectGui(){
    
    guiElements.main = document.getElementById("main");
    
    guiElements.mainPages = document.getElementsByClassName("indexPage");
    guiElements.mainTabs = document.getElementsByClassName("indexTab");
    
    var nl = document.getElementsByClassName("progBtn");
    for (var i = 0; i < nl.length; i++) {
        guiElements.progBtns[i] = nl[i];
    }
    
    nl = document.getElementsByClassName("prevBtn");
    for (var i = 0; i < nl.length; i++) {
        guiElements.prevBtns[i] = nl[i];
    }
    
    nl = document.getElementsByClassName("auxBtn");
    for (var i = 0; i < nl.length; i++) {
        guiElements.auxBtns[i] = nl[i];
    }

    guiElements.transStyleRadios = document.getElementsByClassName("transStyle");
        
    guiElements.transLengthNumeric = document.getElementById("transLength");
    
    guiElements.aMixers[0].volume = document.getElementById("aMixerMasterVolume");
    guiElements.aMixers[0].vol_bar = document.getElementById("aMixerMasterVolBar");
    guiElements.aMixers[0].level = document.getElementsByClassName("aMixerMasterLevel");
    guiElements.aMixers[0].ref = document.getElementsByClassName("aMixerMasterRef");

    guiElements.aMixers[1].name = document.getElementById("aMixerCh1Name");
    guiElements.aMixers[1].channel = 1;
    guiElements.aMixers[1].mute = document.getElementById("aMixerCh1Mute");
    guiElements.aMixers[1].volume = document.getElementById("aMixerCh1Volume");
    guiElements.aMixers[1].vol_bar = document.getElementById("aMixerCh1VolBar");
    guiElements.aMixers[1].level = document.getElementsByClassName("aMixerCh1Level");
    guiElements.aMixers[1].ref = document.getElementsByClassName("aMixerCh1Ref");

    guiElements.aMixers[2].name = document.getElementById("aMixerCh2Name");
    guiElements.aMixers[2].channel = 2;
    guiElements.aMixers[2].mute = document.getElementById("aMixerCh2Mute");
    guiElements.aMixers[2].volume = document.getElementById("aMixerCh2Volume");
    guiElements.aMixers[2].vol_bar = document.getElementById("aMixerCh2VolBar");
    guiElements.aMixers[2].level = document.getElementsByClassName("aMixerCh2Level");
    guiElements.aMixers[2].ref = document.getElementsByClassName("aMixerCh2Ref");
    
    guiElements.aMixers[3].name = document.getElementById("aMixerCh3Name");
    guiElements.aMixers[3].channel = 3;
    guiElements.aMixers[3].mute = document.getElementById("aMixerCh3Mute");
    guiElements.aMixers[3].volume = document.getElementById("aMixerCh3Volume");
    guiElements.aMixers[3].vol_bar = document.getElementById("aMixerCh3VolBar");
    guiElements.aMixers[3].level = document.getElementsByClassName("aMixerCh3Level");
    guiElements.aMixers[3].ref = document.getElementsByClassName("aMixerCh3Ref");
    
    guiElements.aMixers[4].name = document.getElementById("aMixerCh4Name");
    guiElements.aMixers[4].channel = 4;
    guiElements.aMixers[4].mute = document.getElementById("aMixerCh4Mute");
    guiElements.aMixers[4].volume = document.getElementById("aMixerCh4Volume");
    guiElements.aMixers[4].vol_bar = document.getElementById("aMixerCh4VolBar");
    guiElements.aMixers[4].level = document.getElementsByClassName("aMixerCh4Level");
    guiElements.aMixers[4].ref = document.getElementsByClassName("aMixerCh4Ref");
    
    guiElements.recordBtn = document.getElementById("recordBtn");
    guiElements.stopBtn = document.getElementById("stopBtn");
    guiElements.publishBtn = document.getElementById("publishBtn");
    guiElements.recordSpaceRemain = document.getElementById("recordSpaceLbl");
    guiElements.recordStatus = document.getElementById("recordStatusLbl");
    
    guiElements.settings = document.getElementById("settingsBtn");
    
    guiElements.mediaPlay = document.getElementById("mediaPlay");
    guiElements.mediaPause = document.getElementById("mediaPause");
    guiElements.mediaStop = document.getElementById("mediaStop");
    guiElements.mediaSelect = document.getElementById("mediaSelect");
    guiElements.mediaTitle = document.getElementById("mediaTitle");
    guiElements.mediaStartPosM = document.getElementById("mediaStartPosM");
    guiElements.mediaStartPosS = document.getElementById("mediaStartPosS");
    
    guiElements.ptzZoomLvl = document.getElementById("ptzZoom");
    guiElements.ptzBoundBox = document.getElementById("ptzBoundBox");
    guiElements.ptzHitarea = document.getElementById("ptzHitarea");
    guiElements.ptzCams = document.getElementsByClassName("ptzCamTab");
    
    guiElements.publish = document.getElementById("publish");
    guiElements.publishPages = document.getElementsByClassName("publishPage");
    guiElements.publishTabs = document.getElementsByClassName("publishTab");
    guiElements.controlContainer = document.getElementById("controls");
    guiElements.progressContainer = document.getElementById("progress");
    guiElements.sourceFileList = document.getElementById("sourceFileList");
    guiElements.publishCopyBtn = document.getElementById("publishCopyBtn");
    guiElements.publishDeleteBtn = document.getElementById("publishDeleteBtn");
    guiElements.publishFileList = document.getElementById("publishFileList");
    guiElements.burnerStartBtn = document.getElementById("burnerStartBtn");
    guiElements.burnerResumeBtn = document.getElementById("burnerResumeBtn");
    guiElements.fileStartBtn = document.getElementById("fileStartBtn");
    guiElements.fileResumeBtn = document.getElementById("fileResumeBtn");
    
    guiElements.uploadURI = document.getElementById("uploadURI");
    guiElements.uploadUser = document.getElementById("uploadUser");
    guiElements.uploadPwd = document.getElementById("uploadPwd");
    guiElements.uploadOutName = document.getElementById("uploadOutName");
    guiElements.uploadStartBtn = document.getElementById("uploadStartBtn");
    guiElements.uploadResumeBtn = document.getElementById("uploadResumeBtn");
    guiElements.progressText = document.getElementById("progressText");
    guiElements.currentProgress = document.getElementById("currentProgress");
    
    hmc = new Hammer.Manager(guiElements.ptzHitarea);
    hmc.add(new Hammer.Pan({ threshold: 10, pointers: 0 }));
    hmc.on("panstart", ptzInitPan);
    hmc.on("panmove", ptzPan);
    
    hmc.on("hammer.input", function(ev) {
        if(ev.isFinal) {
            ptzReset();
        }
    });
    
    guiElements.aMixers[0].vol_bar.onmousedown = volInitChange_Master;
    guiElements.aMixers[0].vol_bar.onmousemove = volChange_Master;
    guiElements.aMixers[0].vol_bar.onmouseleave = volEndChange;
    guiElements.aMixers[0].vol_bar.onmouseup = volEndChange;
    preventLongPressMenu(guiElements.aMixers[0].vol_bar);
    
    guiElements.aMixers[1].vol_bar.onmousedown = volInitChange_1;
    guiElements.aMixers[1].vol_bar.onmousemove = volChange_1;
    guiElements.aMixers[1].vol_bar.onmouseleave = volEndChange;
    guiElements.aMixers[1].vol_bar.onmouseup = volEndChange;
    preventLongPressMenu(guiElements.aMixers[1].vol_bar);
    
    guiElements.aMixers[2].vol_bar.onmousedown = volInitChange_2;
    guiElements.aMixers[2].vol_bar.onmousemove = volChange_2;
    guiElements.aMixers[2].vol_bar.onmouseleave = volEndChange;
    guiElements.aMixers[2].vol_bar.onmouseup = volEndChange;
    preventLongPressMenu(guiElements.aMixers[2].vol_bar);
    
    guiElements.aMixers[3].vol_bar.onmousedown = volInitChange_3;
    guiElements.aMixers[3].vol_bar.onmousemove = volChange_3;
    guiElements.aMixers[3].vol_bar.onmouseleave = volEndChange;
    guiElements.aMixers[3].vol_bar.onmouseup = volEndChange;
    preventLongPressMenu(guiElements.aMixers[3].vol_bar);
    
    guiElements.aMixers[4].vol_bar.onmousedown = volInitChange_4;
    guiElements.aMixers[4].vol_bar.onmousemove = volChange_4;
    guiElements.aMixers[4].vol_bar.onmouseleave = volEndChange;
    guiElements.aMixers[4].vol_bar.onmouseup = volEndChange;
    preventLongPressMenu(guiElements.aMixers[4].vol_bar);
    
}

if (!(window.WebSocket)){
     alert("BROWSER NOT SUPPORTED");
}
