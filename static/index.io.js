
var socket = 0;
var hmc = 0;
var panStart = [0,0];
var ptz = {camera:1, pan:0, tilt:0, zoom:0};
var lastMouse = {clientY:-1};

var atemStatus = {program:0,preview:0,aux:0,ftb:0,transLength:0.6,audioChannels:[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]]};
var enableALvls = 0;
var transStyle = '';
var atemALvl = {audioLevels:[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]]};

var atemALvlPresets = [ {audioChannels:[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]]},
                        {audioChannels:[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[1,-8],[0,0],[0,0]]},
                        {audioChannels:[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[1,-15],[0,0],[0,0]]},
                        {audioChannels:[[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[1,-15],[0,0],[1,-15],[0,0],[0,0]]} ];
                        
var recorderStatus = {connected:0,recording:0,remainingSpace:'Remaining&nbsp;Space&nbsp;Unavailable'};
var mplayerStatus = {connected:0,playing:0};
var publisherStatus = {status:0,complete:0};
var volSliderMouseDown = false;

guiElements = {pages:[],
    tabs:[],
    progBtns:[],
    prevBtns:[],
    auxBtns:[],
    transLengthNumeric:0,
    aMixers:[{name:"master",channel:0,mute:1,volume:0,level:[],ref:[]},
    {name:"ch1",channel:1,mute:1,volume:0,level:[],ref:[]},
    {name:"ch2",channel:2,mute:1,volume:0,vol_bar:0,level:[],ref:[]},
    {name:"ch3",channel:3,mute:1,volume:0,level:[],ref:[]},
    {name:"ch4",channel:4,mute:1,volume:0,level:[],ref:[]}],
    record:0,
    stop:0,
    publish:0,
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
    ptzCams:[]}


function onAtemUpdate(status){
    atemStatus = status;
    //console.log(status);
    
    guiProgramSwitcher(); //set program
    guiPreviewSwitcher(); //set preview
    guiAuxSwitcher(); //set aux
    guiTransLength(); //set translength
    guiAudioChannel(0); //set audio master
    guiAudioChannel(1); //set audio mixer1
    guiAudioChannel(2); //set audio mixer2
    guiAudioChannel(3); //set audio mixer3
    guiAudioChannel(4); //set audio mixer4
    
}


function onAtemAudioLevel(levels){
    
    if(enableALvls) {
        atemALvl = levels;
        
        guiAudioLevel(0); //set audio master
        guiAudioLevel(1); //set audio mixer1
        guiAudioLevel(2); //set audio mixer2
        guiAudioLevel(3); //set audio mixer3
        guiAudioLevel(4); //set audio mixer4
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
    
}


function setAtemProgram(input){
    socket.emit('changeProgram', {input:input,trans:transStyle});
}

function setAtemPreview(input){
    socket.emit('setPreview', input);
}

function setAtemAux(input){
    socket.emit('setAux', input);
}

function setAtemTransLength(){
    socket.emit('setTransLength', guiElements.transLengthNumeric.value);
}

function setAtemTransition(){}


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
    
    socket.emit('setAudioMute', {channel:guiElements.aMixers[mixer].channel,mute:(atemStatus.audioChannels[chnl][0]+1)%2});
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

function setAtemAudioVolume(mixer){
    socket.emit('setAudioVolume', {channel:guiElements.aMixers[mixer].channel,volume:guiElements.aMixers[mixer].volume.value});
}

function volInitChange(ev, mixer){
    volSliderMouseDown = true;
    lastMouse.clientY = -1;
    volChange(ev, mixer);
}

function volChange(ev, mixer){
    
    if(!volSliderMouseDown || lastMouse.clientY == ev.clientY){
        return;
    }
    
    guiElements.aMixers[mixer].volume.style.top = (ev.offsetY-(guiElements.aMixers[mixer].volume.offsetHeight/2))+'px';
    
    var vol = Math.round(6-((ev.offsetY/(guiElements.aMixers[mixer].vol_bar.offsetHeight))*67));

    socket.emit('setAudioVolume', {channel:guiElements.aMixers[mixer].channel,volume:vol});
    console.log('Mixer '+mixer+': '+vol);
    lastMouse = ev;
}

function volEndChange(){
  volSliderMouseDown = false;
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
    volChange(ev,0)
}

function volChange_1(ev){
    volChange(ev,1)
}

function volChange_2(ev){
    volChange(ev,2)
}

function volChange_3(ev){
    volChange(ev,3)
}

function volChange_4(ev){
    volChange(ev,4)
}

function runAtemAudioPreset(preset){
    socket.emit('runAudioPreset', atemALvlPresets[preset]);
}

function record(){
    socket.emit('record',1);
}

function stopRecord(){
    socket.emit('record',0);
}

function publish(){
    window.location = "/publish";
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
function guiPageSwitcher(page){
    
    var length = (guiElements.pages.length < guiElements.tabs.length) ? guiElements.pages.length : guiElements.tabs.length;
    
    for (var i = 0; i < length; i++) {
        if(i==page){
            guiElements.tabs[i].className = "indexTab active";
            guiElements.pages[i].style = "";
        } else {
            guiElements.tabs[i].className = "indexTab";
            guiElements.pages[i].style = "display:none;";
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
        
        //Set volume
        //guiElements.aMixers[mixer].volume.value = atemStatus.audioChannels[chnl][1];
        guiElements.aMixers[mixer].volume.style.top = (((atemStatus.audioChannels[chnl][1]-6)/-66)*guiElements.aMixers[mixer].vol_bar.offsetHeight)+'px';
        
    } else {
        //guiElements.aMixers[0].volume.value = atemStatus.audioChannels[0][1];
        guiElements.aMixers[0].volume.style.top = (((atemStatus.audioChannels[0][1]-6)/-66)*guiElements.aMixers[0].vol_bar.offsetHeight)+'px';
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
        guiElements.aMixers[mixer].level[0].style = "height:"+(atemALvl.audioLevels[chnl][0]*-1.1)+"%;";
        guiElements.aMixers[mixer].level[1].style = "height:"+(atemALvl.audioLevels[chnl][1]*-1.1)+"%;";
    } else if (mixer==0){
        guiElements.aMixers[0].level[0].style = "height:"+(atemALvl.audioLevels[0][0]*-1.1)+"%;";
        guiElements.aMixers[0].level[1].style = "height:"+(atemALvl.audioLevels[0][1]*-1.1)+"%;";
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
        guiElements.record.className = guiElements.record.className.replace( /(?:^|\s)btn-danger(?!\S)/g , ' btn-default ' );
        guiElements.record.innerHTML = 'RECORD';
        guiElements.publish.className = guiElements.publish.className.replace( /(?:^|\s)btn-primary(?!\S)/g , ' btn-default ' );
        guiElements.publish.innerHTML = 'PUBLISH';
        guiElements.publish.disabled = false;
        guiElements.record.disabled = true;
        guiElements.stop.disabled = true;
    } else if(recorderStatus.recording){
        guiElements.recordSpaceRemain.innerHTML = "<b>Recording Space:</b> Unavailable&nbsp;while&nbsp;recording";
        guiElements.recordStatus.innerHTML = "<b>Currently Recording</b>";
        guiElements.record.className = guiElements.record.className.replace( /(?:^|\s)btn-default(?!\S)/g , ' btn-danger ' );
        guiElements.record.innerHTML = 'NOW RECORDING';
        guiElements.publish.className = guiElements.publish.className.replace( /(?:^|\s)btn-primary(?!\S)/g , ' btn-default ' );
        guiElements.publish.disabled = true;
        guiElements.stop.disabled = false;
        guiElements.record.disabled = true;
    } else if(publisherStatus.status!=0){
        guiElements.recordSpaceRemain.innerHTML = "<b>Recording Space:</b> "+recorderStatus.remainingSpace;
        guiElements.recordStatus.innerHTML = "<b>Unable to Record</b> (Publishing)";
        guiElements.record.className = guiElements.record.className.replace( /(?:^|\s)btn-danger(?!\S)/g , ' btn-default ' );
        guiElements.record.innerHTML = 'RECORD';
        guiElements.publish.className = guiElements.publish.className.replace( /(?:^|\s)btn-default(?!\S)/g , ' btn-primary ' );
        guiElements.publish.innerHTML = 'PUBLISHING';
        guiElements.publish.disabled = true;
        guiElements.stop.disabled = true;
        guiElements.record.disabled = true;
    } else {
        guiElements.recordSpaceRemain.innerHTML = "<b>Recording Space:</b> "+recorderStatus.remainingSpace;
        guiElements.recordStatus.innerHTML = "<b>Currently Recording</b>";
        guiElements.record.className = guiElements.record.className.replace( /(?:^|\s)btn-danger(?!\S)/g , ' btn-default ' );
        guiElements.record.innerHTML = 'RECORD';
        guiElements.publish.className = guiElements.publish.className.replace( /(?:^|\s)btn-primary(?!\S)/g , ' btn-default ' );
        guiElements.publish.innerHTML = 'PUBLISH';
        guiElements.publish.disabled = false;
        guiElements.record.disabled = false;
        guiElements.stop.disabled = true;
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
    socket.emit('sendPtzCmd', {camera:ptz.camera,pan:0,tilt:0,zoom:0});
    console.log('PTZ reset');
    
}

function ptzZoom(){
    
    var zoom  = guiElements.ptzZoomLvl.value;

    if(zoom!=ptz.zoom){
        ptz.zoom = zoom;
        socket.emit('sendPtzCmd', {camera:ptz.camera,
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

        socket.emit('sendPtzCmd', {camera:ptz.camera,
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
    socket.emit('sendPtzRecall', {camera:ptz.camera,
                                slot:preset});
}


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
    socket.on("atemUpdate", function (status) {onAtemUpdate(status);});
    socket.on("atemALvls", function (levels) {onAtemAudioLevel(levels);});
    socket.on("recorderUpdate", function (status) {onRecorderUpdate(status);});
    socket.on("mplayerUpdate", function (status) {onMplayerUpdate(status);});
    socket.on("publisherUpdate", function (status) {onPublisherUpdate(status);});
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
    
    guiElements.pages = document.getElementsByClassName("indexPage");
    guiElements.tabs = document.getElementsByClassName("indexTab");
    
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
    
    guiElements.record = document.getElementById("recordBtn");
    guiElements.stop = document.getElementById("stopBtn");
    guiElements.publish = document.getElementById("publishBtn");
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
