
var socket = 0;
var hmc = 0;
var panStart = [0,0];
var ptz = {camera:1, pan:0, tilt:0, zoom:0};
var lastMouse = {clientX:-1,clientY:-1};

var atemStatus = {program:0,preview:0,aux:0,ftb:0,transLength:0.6,audioChannels:{"0":[0,0],"1":[0,0],"2":[0,0],"3":[0,0],"4":[0,0],"5":[0,0],"6":[0,0],"7":[0,0],"8":[0,0], "1001":[0,0], "1201":[0,0]},dsk:[{live:false,tie:false},{live:false,tie:false}]};
var enableALvls = 0;
var transStyle = 'mix'; // possible values: 'none', 'cut', 'mix'
var atemALvl = {audioLevels:{"0":[-100,-100],"1":[-100,-100],"2":[-100,-100],"3":[-100,-100],"4":[-100,-100],"5":[-100,-100],"6":[-100,-100],"7":[-100,-100],"8":[-100,-100], "1001":[-100,-100], "1201":[-100,-100]}};
var mixerAChnls = [ {id:"1", name:"PC (HDMI)"}, {id:"2", name:"Video PC (HDMI)"}, {id:"3", name:"DESK (HDMI)"},
                    {id:"4", name:"Spare (HDMI)"}, {id:"7", name:"Video Converter (SDI)"}, {id:"8", name:"Spare (SDI)"},
                    {id:"1201", name:"Mixer A (RCA)"}, {id:"1001", name:"Mics (XLR)"}];
                        
var recorderStatus = {connected:0,recording:0,remainingSpace:'Remaining&nbsp;Space&nbsp;Unavailable'};
var mplayerStatus = {connected:0,playing:0};
var vcallStatus = {system:0,login:0,call:0};
var publisherStatus = {status:0,complete:0,lastDiscStatus:0,lastFileStatus:0};
var publisherErrConfirm = 0;
var publisherTranscodeOptions = [ {"mediatype":"video"},
    {"mediatype":"video", "filetype":"mp4", "vFormat":"scale=1920:1080", "vFRate":"25", "vCodec":"libx264", "vBitrate":"8000k", "aCodec":"aac", "aBitrate":"320k"},
    {"mediatype":"video", "filetype":"mp4", "vFormat":"scale=1280:720", "vFRate":"25", "vCodec":"libx264", "vBitrate":"5000k", "aCodec":"aac", "aBitrate":"320k"},
    {"mediatype":"video", "filetype":"mp4", "vFormat":"scale=960:540", "vFRate":"25", "vCodec":"libx264", "vBitrate":"3000k", "aCodec":"aac", "aBitrate":"320k"},
    {"mediatype":"video", "filetype":"mp4", "vFormat":"scale=640:360", "vFRate":"25", "vCodec":"libx264", "vBitrate":"1000k", "aCodec":"aac", "aBitrate":"320k"},
    {"mediatype":"audio", "filetype":"mp3", "aCodec":"libmp3lame", "aBitrate":"320k"},
    {"mediatype":"audio", "filetype":"mp3", "aCodec":"libmp3lame", "aBitrate":"160k"},
    {"mediatype":"audio", "filetype":"mp3", "aCodec":"libmp3lame", "aBitrate":"96k"},
    {"mediatype":"audio", "filetype":"mp3", "aCodec":"libmp3lame", "aBitrate":"64k"}];

var slideControlMouseDown = '';

var aMixers = {};


function menu(){
    
    $('#main').hide();
    $('#publish').hide();
    $('#settings').hide();
    $('#menu').show();
    
    enableAtemAlvls(false);
    
}

function main(){
    
    $('#menu').hide();
    $('#publish').hide();
    $('#settings').hide();
    $('#main').show();
    
    enableAtemAlvls(true);
    
}

function publish(){
    
    $('#main').hide();
    $('#menu').hide();
    $('#settings').hide();
    $('#publish').show();
    
    enableAtemAlvls(false);
    
    socket.emit('publisher_getFileList');
    socket.emit('publisher_getRemovableList');
    
}

function settings(){
    
    $('#main').hide();
    $('#menu').hide();
    $('#publish').hide();
    $('#settings').show();
    
    enableAtemAlvls(false);
    
}

function onAtemUpdate(status){
    atemStatus = status;
    //console.log(status);
    
    guiProgramSwitcher(); //set program
    guiPreviewSwitcher(); //set preview
    guiAuxSwitcher(); //set aux
    guiTransLength(); //set translength
    
    var mixerNames = Object.keys(aMixers);
    for (var i = 0; i < mixerNames.length; i++) {
        guiAudioChannel(mixerNames[i]); // Update audio mixer volumes for each mixer
    }
}


function onAtemAudioLevel(levels){
    
    if(enableALvls) {
        atemALvl = levels;
        
        var mixerNames = Object.keys(aMixers);
        for (var i = 0; i < mixerNames.length; i++) {
            guiAudioLevel(mixerNames[i]); // Update audio mixer levels for each mixer
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
    
    guiMplayer(); //update media player
    
}

function onVcallerUpdate(status){
    vcallStatus = status;
    //console.log(status);
    
    guiVcaller(); //update video caller
    
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
    socket.emit('atem_setTransLength', $('#transLength').val()/1000);
}

function setAtemTransition(){
    
}


function enableAtemAlvls(enable){
    enableALvls = enable;
    if(!enable){
        atemALvl = {audioLevels:{'0':[-100,-100],'1':[-100,-100],'2':[-100,-100],'3':[-100,-100],'4':[-100,-100],'5':[-100,-100],'6':[-100,-100],'7':[-100,-100],'8':[-100,-100], '1001':[-100,-100], '1201':[-100,-100]}};
    }
}


function setAtemAudioMute(mixerId){
    
    // Get the channel assiciated with this mixer
    var chnl = aMixers[mixerId].filter('.amixer-channel').val();
    
    // Send request to set the mute value for the given channel to the opposite if its current value
    socket.emit('atem_setAudioMute', {channel:chnl,mute:(atemStatus.audioChannels[chnl][0]+1)%2});
}


function volInitChange(ev, mixerId){
    slideControlMouseDown = mixerId;
    lastMouse.clientY = -1;
    volChange(ev, mixerId);
}

function volChange(ev, mixerId){
    
    if(slideControlMouseDown!=mixerId || lastMouse.clientY == ev.clientY){
        return;
    }
    
    var fader = aMixers[mixerId].filter('div.amixer-volume-div').find('.volume-fader');
    var hitbox = aMixers[mixerId].filter('div.amixer-volume-div').find('.volume-hitbox');
    var chnl = aMixers[mixerId].filter('.amixer-channel').val();
    
    fader.css('top', (ev.offsetY-(fader.outerHeight()/2))+'px');
    
    var faderPosPercent = ev.offsetY/hitbox.outerHeight();
    var linScaledPercent = 0.24-(faderPosPercent*1.25); // Gives a value from +0.24 to -1
    var logScaledVol = 60*Math.pow(Math.abs(linScaledPercent),1.6); // Scales this to an abs value for the range between +6 and -60dB
    if(linScaledPercent<0){
        logScaledVol *= -1; // Flips a scaled volume back to negative if it was a negative percent
    }

    socket.emit('atem_setAudioVolume', {channel:chnl,volume:logScaledVol});
    //console.log('Mixer '+mixer+': '+logScaledVol);
    lastMouse = ev;
}

function volEndChange(mixerId){
    if(slideControlMouseDown!=mixerId){
        return;
    }
    slideControlMouseDown = '';
    guiAudioChannel(mixerId);
}



function runAtemAudioPreset(preset){
    socket.emit('atem_runAudioPreset', preset);
}

function record(){
    socket.emit('recorder_record',1);
}

function stopRecord(){
    socket.emit('recorder_record',0);
}

function playMedia(){
    
    var media = $('#mediaSelect').val();
    var start = ((parseInt($('#mediaStartPosM').val())*60)+parseInt($('#mediaStartPosS').val()));
    var title = $('#mediaTitle').val();
    
    if(media == 0){
        return; // nothing selected
    } else if(media=='recstream'){
        media = 'http://192.168.10.232:5000/ :network-caching=200';
    } else if(media=='bluray'){
        media = 'bluray:///dev/sr0#'+title+' :disc-caching=300 :start-time='+start;
    } else if(media=='dvd'){
        media = 'dvdsimple:///dev/sr0#'+title+' :disc-caching=300 :start-time='+start;
    } else if(media=='vcd'){
        media = 'vcd:///dev/sr0#'+title+' :disc-caching=300 :start-time='+start;
    } else if(media=='cdda'){
        media = 'cdda:///dev/sr0 :cdda-track='+title+' :disc-caching=300 :start-time='+start;
    } else if(media=='mrl'){
        media = $('#mediaMRL').val();
    } else {
        media = media + ' :start-time='+start;
    }
    
    //console.log(media);
    socket.emit('mediaplayer_play', media);
}
    

    
function pauseMedia(){
    socket.emit('mediaplayer_pause');
}
    
function stopMedia(){
    socket.emit('mediaplayer_stop');
}

function loginCall(){
    var service = $('#mediaSelect').val();
    var user = '';
    var pass = '';
    
    if(service == 'messenger'){
        user = $('#messengerUser').val();
        pass = $('#messengerPass').val();
    } else if(service == 'hangouts'){
        user = $('#messengerUser').val();
        pass = $('#messengerPass').val();
    }
    
    socket.emit('videocaller_caller_login', {'service':service, 'user':user, 'pass':pass});
}

function startCall(){
    var service = $('#mediaSelect').val();
    var contact = '';
    
    if(service == 'messenger'){
        contact = $('#messengerContact').val();
    }
    
    socket.emit('videocaller_caller_start_call', {'contact':contact});
}

function endCall(){
    socket.emit('videocaller_caller_end_call');
}

/**
 * Sets the Active PTZ Camera
 */
function guiPTZCameraSwitcher(cam){
    
    ptz.camera = cam
    
    //Clear the highlighted button
    var highlighted = $('.ptz-cam-tab.active');
    highlighted.removeClass('active');
    
    //Highlight new button
    var nextHighlighted = $('.ptz-cam-tab.cam-'+cam);
    nextHighlighted.addClass('active');
    
}

/**
 * Updates the interface's tabs/pages
 */
function guiMainPageSwitcher(page){
    
    $('.index-tab.active').removeClass('active');
    $('.index-page').hide();
    
    $('.index-tab.tab-'+page).addClass('active');
    $('.index-page.page-'+page).show();
    
    if(page=='vswitch'){
        enableAtemAlvls(false);
        
    } else if(page=='amixers'){
        enableAtemAlvls(true);
        
        var mixerNames = Object.keys(aMixers);
        for (var i = 0; i < mixerNames.length; i++) {
            guiAudioChannel(mixerNames[i]); // Update audio mixer volumes for each mixer
        }
        
    } else if(page=='ptz'){
        enableAtemAlvls(false);
        
        $('div.ptz-hitbox').each(function() {
            var slider = $( this ).siblings('.ptz-slider');
            slider.css('top', (($( this ).outerHeight()/2)-(slider.outerHeight()/2))+'px');
            slider.css('left', (($( this ).outerWidth()/2)-(slider.outerWidth()/2))+'px');
        });
        
    } else if(page=='mplayer'){
        enableAtemAlvls(false);
        guiMselect();
        
    } else if(page=='record'){
        enableAtemAlvls(false);
        
    }
    
}

/**
 * Updates the interface's program chooser
 */
function guiProgramSwitcher(){
    
    //Clear the highlighted button
    var highlighted = $('.progBtn.btn-danger');
    highlighted.removeClass('btn-danger');
    highlighted.addClass('btn-prog');
    
    //Highlight new button
    var nextHighlighted = $('.progBtn.prog-'+atemStatus.program);
    nextHighlighted.removeClass('btn-prog');
    nextHighlighted.addClass('btn-danger');
    
    //Highlight Keyer Buttons
    for(var i=0; i< atemStatus.dsk.length; i++){
        if(atemStatus.dsk[i].live){
            var nextDsk = $('.prevBtn.prev-50'+((i+1)*10));
            nextHighlighted.removeClass('btn-prog');
            nextHighlighted.addClass('btn-danger');
        }
    }
}

/**
 * Updates the interface's preview chooser
 */
function guiPreviewSwitcher(){
    
    //Clear the highlighted button
    var highlighted = $('.prevBtn.btn-success');
    highlighted.removeClass('btn-success');
    highlighted.addClass('btn-prev');
    
    //Highlight new button
    var nextHighlighted = $('.prevBtn.prev-'+atemStatus.preview);
    nextHighlighted.removeClass('btn-prev');
    nextHighlighted.addClass('btn-success');
    
    //Highlight Keyer Buttons
    for(var i=0; i< atemStatus.dsk.length; i++){
        if((atemStatus.dsk[i].live && !atemStatus.dsk[i].tie) || (!atemStatus.dsk[i].live && atemStatus.dsk[i].tie)){
            var nextDsk = $('.prevBtn.prev-50'+((i+1)*10));
            nextHighlighted.removeClass('btn-prev');
            nextHighlighted.addClass('btn-success');
        }
    }
}

/**
 * Updates the interface's aux chooser
 */
function guiAuxSwitcher(){
    
    //Clear the highlighted button
    var highlighted = $('.auxBtn.btn-warning');
    highlighted.removeClass('btn-warning');
    highlighted.addClass('btn-aux');
    
    //Highlight new button
    var nextHighlighted = $('.auxBtn.aux-'+atemStatus.aux);
    nextHighlighted.removeClass('btn-aux');
    nextHighlighted.addClass('btn-warning');

}

/**
 * Sets Auto Transition Effect & Delay
 */
function guiAutoTransSwitcher(trans){
    
    //Update trans style
    transStyle = trans;
    
    //Clear the highlighted button
    var highlighted = $('.transStyle.active');
    highlighted.removeClass('active');
    
    //Highlight new button
    var nextHighlighted = $('.transStyle.trans-'+trans);
    nextHighlighted.addClass('active');
    
}

/**
 * Updates one of the interface's audio channels based on gui setting
 */
function guiAudioChannel(mixerId){
    
    var fader = aMixers[mixerId].filter('div.amixer-volume-div').find('.volume-fader');
    var hitbox = aMixers[mixerId].filter('div.amixer-volume-div').find('.volume-hitbox');
    var chnl = aMixers[mixerId].filter('.amixer-channel').val();
    
    if(chnl != '0'){
    
        //Set mute
        if (atemStatus.audioChannels[chnl][0]){
            
            var levelsDiv = aMixers[mixerId].filter('div.amixer-levels');
            levelsDiv.removeClass('amixer-muted');
            
            var muteBtn = aMixers[mixerId].filter('div.amixer-levels').find('button.btn-mute');
            muteBtn.removeClass('btn-default');
            muteBtn.addClass('btn-success');
            muteBtn.text('LIVE');
            
        } else {
           
            var levelsDiv = aMixers[mixerId].filter('div.amixer-levels');
            levelsDiv.addClass('amixer-muted');
            
            var muteBtn = aMixers[mixerId].filter('div.amixer-levels').find('button.btn-mute');
            muteBtn.removeClass('btn-success');
            muteBtn.addClass('btn-default');
            muteBtn.text('MUTED');
            
        }
        
    }
        
    // Update mixer fader position (except if the user is interacting with the volume fader for this mixer)
    if(slideControlMouseDown!=(mixerId)){
        
        var linScaledPercent = Math.pow(Math.abs(atemStatus.audioChannels[chnl][1]/60),0.625); // Gives a value from +0.24 to -1
        if(atemStatus.audioChannels[chnl][1]<0){
            linScaledPercent *= -1; // Flips a volume percent back to negative if it was from a negative value
        }
        var faderPosPercent = (linScaledPercent-0.24)*-0.8; 
        
        fader.css('top', ((faderPosPercent*hitbox.outerHeight())-(fader.outerHeight()/2))+'px');

    }
    
}

/**
 * Updates one of the interface's audio levels
 */
function guiAudioLevel(mixerId){
    
    var chnl = aMixers[mixerId].filter('.amixer-channel').val();
    var aLvlL = aMixers[mixerId].filter('.amixer-levels-div').find('div.level-bar.level-left div.level-value');
    var aLvlR = aMixers[mixerId].filter('.amixer-levels-div').find('div.level-bar.level-right div.level-value');
    
    //Set level
    var linScaledPercentL = Math.pow(Math.abs(atemALvl.audioLevels[chnl][0]/60),0.625);
    var linScaledPercentR = Math.pow(Math.abs(atemALvl.audioLevels[chnl][1]/60),0.625);
    aLvlL.css('height', (linScaledPercentL*80)+"%");
    aLvlL.css('height', (linScaledPercentR*80)+"%");
            
}

function guiTransLength(){
    $('#transLength').val(atemStatus.transLength*1000);
}

//recorder stuff

/**
 * Updates the interface's record buttons
 */
function guiRecord(){
    
    if(recorderStatus.connected<=0){
        $('#recordSpaceLbl').html("<b>Recording Space:</b> "+recorderStatus.remainingSpace);
        $('#recordStatusLbl').html("<b>Recorder Offline</b>");
        $('#recordBtn').removeClass('btn-danger');
        $('#recordBtn').addClass('btn-default');
        $('#recordBtn').html('RECORD');
        $('#recordBtn').attr('disabled','disabled');
        $('#stopBtn').attr('disabled','disabled');
    } else if(recorderStatus.recording){
        $('#recordSpaceLbl').html("<b>Recording Space:</b> Unavailable&nbsp;while&nbsp;recording");
        $('#recordStatusLbl').html("<b>Currently Recording</b>");
        $('#recordBtn').removeClass('btn-default');
        $('#recordBtn').addClass('btn-danger');
        $('#recordBtn').html('NOW RECORDING');
        $('#recordBtn').attr('disabled','disabled');
        $('#stopBtn').removeAttr('disabled');
        
    } else if(publisherStatus.status!=0){
        $('#recordSpaceLbl').html("<b>Recording Space:</b> "+recorderStatus.remainingSpace);
        $('#recordStatusLbl').html("<b>Unable to Record</b> (Publishing)");
        $('#recordBtn').removeClass('btn-danger');
        $('#recordBtn').addClass('btn-default');
        $('#recordBtn').html('RECORD');
        $('#recordBtn').attr('disabled','disabled');
        $('#stopBtn').attr('disabled','disabled');
    } else {
        $('#recordSpaceLbl').html("<b>Recording Space:</b> "+recorderStatus.remainingSpace);
        $('#recordStatusLbl').html("<b>Ready to Record</b>");
        $('#recordBtn').removeClass('btn-danger');
        $('#recordBtn').addClass('btn-default');
        $('#recordBtn').html('RECORD');
        $('#recordBtn').removeAttr('disabled');
        $('#stopBtn').attr('disabled','disabled');
    }
    
}

/**
 * Updates the interface's mplayer buttons
 */
function guiMplayer(){
    
    if(mplayerStatus.playing==0){
        $('#mediaPause').attr("disabled","true");
        $('#mediaPause').html('<span class="glyphicon glyphicon-pause" aria-hidden="true"></span>&nbsp;PAUSE PLAYBACK&nbsp;');
    } else if(mplayerStatus.playing==1){
        $('#mediaPause').removeAttr('disabled');
        $('#mediaPause').html('<span class="glyphicon glyphicon-pause" aria-hidden="true"></span>&nbsp;PAUSE PLAYBACK&nbsp;');
    } else if(mplayerStatus.playing==2){
        $('#mediaPause').removeAttr('disabled');
        $('#mediaPause').html('<span class="glyphicon glyphicon-play" aria-hidden="true"></span>&nbsp;RESUME PLAYBACK');
    }
    
}

/**
 * Updates the interface's video call (mplayer) buttons
 */
function guiVcaller(){
    
    if(vcallStatus.system==0){
        $('#callLogin').removeAttr('disabled');
        $('#callStart').attr("disabled","true");
        $('#callEnd').attr("disabled","true");
    } else if(vcallStatus.login==0){
        $('#callLogin').removeAttr('disabled');
        $('#callStart').attr("disabled","true");
        $('#callEnd').removeAttr('disabled');
    } else {
        $('#callLogin').attr("disabled","true");
        $('#callStart').removeAttr('disabled');
        $('#callEnd').removeAttr('disabled');
    }
    
}

function guiMselect(){
    
    var selected = $('#mediaSelect').val();
    
    console.log(selected);
    
    $('.media-config').hide();
    
    
    if(selected=='recstream'){
        $('.btn-media-call').hide();
        $('.btn-media-av').show();
    } else if(selected=='cdda'){
        $('.btn-media-call').hide();
        $('.btn-media-av').show();
        $('#mediaStdConfig').show();
        $('#mediaTitleLabel').text('TRACK');
    } else if(selected=='mrl'){
        $('.btn-media-call').hide();
        $('.btn-media-av').show();
        $('#mediaCustConfig').show();
    } else if(selected=='hangouts'){
        $('.btn-media-av').hide();
        $('.btn-media-call').show();
        $('#callHangoutsConfig').show();
    } else if(selected=='messenger'){
        $('.btn-media-av').hide();
        $('.btn-media-call').show();
        $('#callMessengerConfig').show();
    } else if(selected=='skype'){
        $('.btn-media-av').hide();
        $('.btn-media-call').show();
        $('#callSkypeConfig').show();
    } else {
        $('.btn-media-call').hide();
        $('.btn-media-av').show();
        $('#mediaStdConfig').show();
        $('#mediaTitleLabel').text('TITLE');
    }
    
}

//camera stuff

function ptzReset(control){

    //Prevent mouseLeave events from triggering reset unless mouse was down.
    if(slideControlMouseDown!=control){
        return;
    }
    
    slideControlMouseDown = '';
    
    if(control){
        var hitbox = $('#'+control+' div.ptz-hitbox');
        var slider = $('#'+control+' .ptz-slider');
        
        slider.css('top', ((hitbox.outerHeight()/2)-(slider.outerHeight()/2))+'px');
        slider.css('left', ((hitbox.outerWidth()/2)-(slider.outerWidth()/2))+'px');
    }
    
    socket.emit('visca_sendPtzCmd', {camera:ptz.camera,pan:0,tilt:0,zoom:0});
    console.log('PTZ reset');
    
}

function ptzInitZoom(ev, control){
    slideControlMouseDown = control;
    lastMouse.clientY = -1;
    ptzZoom(ev, control);
}

function ptzZoom(ev, control){
    
    var zoom  = 0;
    
    if(ev){
    
        if(slideControlMouseDown != control || lastMouse.clientY == ev.clientY){
            return;
        }
        
        console.log(control);
        
        var hitbox = $('#'+control+' div.ptz-hitbox');
        var slider = $('#'+control+' .ptz-slider');
        
        slider.css('top', (ev.offsetY-(slider.outerHeight()/2))+'px');
        
        tilt = Math.round(((ev.offsetY/hitbox.outerHeight()) - 0.5)*-12.0);
        
    } else {
        
        if(control == 'tele') {
            zoom = 3;
        } else if(control == 'wide') {
            zoom = -3;
        }
        
    }

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
    
    lastMouse = ev;
    
}

function ptzInitPan(ev, control){
    slideControlMouseDown = control;
    lastMouse.clientX = -1;
    lastMouse.clientY = -1;
    ptzPan(ev, control);
}

function ptzPan(ev, control){
    
    var pan  = 0;
    var tilt = 0;
    
    if(ev){
    
        if(slideControlMouseDown != control || (lastMouse.clientX == ev.clientX && lastMouse.clientY == ev.clientY)){
            return;
        }
        
        console.log(control);
        
        var hitbox = $('#'+control+' div.ptz-hitbox');
        var slider = $('#'+control+' .ptz-slider');
        
        slider.css('top', (ev.offsetY-(slider.outerHeight()/2))+'px');
        slider.css('left', (ev.offsetX-(slider.outerWidth()/2))+'px');
        
        pan  = Math.round(((ev.offsetX/hitbox.outerWidth() ) - 0.5)*18.0);
        tilt = Math.round(((ev.offsetY/hitbox.outerHeight()) - 0.5)*-14.0);
        
    } else {
        
        if(control == 'up') {
            tilt = 3;
        } else if(control == 'down') {
            tilt = -3;
        } else if(control == 'left') {
            pan = -3;
        } else if(control == 'right') {
            pan = 3;
        }
        
    }
        
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
    
    lastMouse = ev;
}


function ptzRecallPreset(preset){
    socket.emit('visca_sendPtzRecall', {camera:ptz.camera,
                                slot:preset});
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function onFileList(list){
    
    // Clear list
    $('#sourceFileList').empty();
    
    // Write new elements
    for (var i = 0; i < list.length; i++) {
        $('#sourceFileList').prepend('<li class="publish-add-remove list-group-item" style="padding:0"><button onclick="copyToPublishList('+"'"+list[i]+"'"+')"><span class="glyphicon glyphicon-plus"></span></button><div>'+list[i]+'</div></li>');
    }
    
}

function onRemovableList(list){
    
    // Clear list
    $('#fileDestDevice').empty();
    
    // Write new elements
    for (var i = 0; i < list.length; i++) {
        $('#fileDestDevice').append('<option>'+list[i]+'</option>');
    }
    
}

/**
 * Updates the interface's tabs/pages
 */
function guiPublishPageSwitcher(page){
    
    $('.publish-tab.active').removeClass('active');
    $('.publish-page').hide();
    
    $('.publish-tab.tab-'+page).addClass('active');
    $('.publish-page.page-'+page).show();
    
}

/**
 * Updates the interface's program chooser
 */
function guiPublishProgress(){
    
    if(recorderStatus.recording){
        $('#pubControl'  ).hide();
        $('#pubProgress' ).hide();
        $('#pubRecording').show();
    } else if (publisherErrConfirm){
        $('#pubControl'  ).hide();
        $('#pubRecording').hide();
        $('#pubProgress' ).show();
    } else if (publisherStatus.status){
        if(publisherStatus.complete<0){
            publisherStatus.complete *= -1; 
            publisherErrConfirm = 1;
            $('#pubCancelBtn').hide();
            $('#pubErrBackBtn').show();
            $('#pubCurrentProgress').removeClass('progress-bar-primary active');
            $('#pubCurrentProgress').addClass('progress-bar-danger');
        }
        $('#pubControl'  ).hide();
        $('#pubRecording').hide();
        $('#pubProgress' ).show();
        $('#pubCurrentProgress').css('width',(Math.round(publisherStatus.complete*100))+"%");
        $('#pubProgressText').html(publisherStatus.status);
        
    } else {
        $('#pubRecording').hide();
        $('#pubProgress' ).hide();
        $('#pubControl'  ).show();
    }
    
    if(publisherStatus.lastDiscStatus==3) {
        $('#burnerResumeBtn').removeAttr("disabled");
        $('#burnerResumeBtn').html('<span class="glyphicon glyphicon-repeat" aria-hidden="true"></span>&nbsp;COPY LAST');
    } else if(publisherStatus.lastDiscStatus>0){
        $('#burnerResumeBtn').removeAttr("disabled");
        $('#burnerResumeBtn').html('<span class="glyphicon glyphicon-play-circle" aria-hidden="true"></span>&nbsp;RESUME LAST');
    } else {
        $('#burnerResumeBtn').attr("disabled","true");
        $('#burnerResumeBtn').html('<span class="glyphicon glyphicon-ban-circle" aria-hidden="true"></span>&nbsp;RESUME/COPY');
    }
    
    if(publisherStatus.lastFileStatus>0){
        $('#fileResumeBtn').removeAttr("disabled");
        $('#uploadResumeBtn').removeAttr("disabled");
        $('#fileResumeBtn').html('<span class="glyphicon glyphicon-play-circle" aria-hidden="true"></span>&nbsp;REPEAT LAST');
        $('#uploadResumeBtn').html('<span class="glyphicon glyphicon-play-circle" aria-hidden="true"></span>&nbsp;REUPLOAD LAST');
    } else {
        $('#fileResumeBtn').attr("disabled","true");
        $('#uploadResumeBtn').attr("disabled","true");
        $('#fileResumeBtn').html('<span class="glyphicon glyphicon-ban-circle" aria-hidden="true"></span>&nbsp;REPEAT LAST');
        $('#uploadResumeBtn').html('<span class="glyphicon glyphicon-ban-circle" aria-hidden="true"></span>&nbsp;REUPLOAD LAST');
    }
    
}

//burner stuff
function copyToPublishList(filename){
    
    $('#publishFileList').append('<li class="list-group-item" style="padding:0"><button style="border:0;padding:4px 14px;background:none;float:right;font-size:1.6em;" onclick="deleteFromPublishList(this)"><span class="glyphicon glyphicon-minus"></span></button><div style="padding:10px;">'+filename+'</div></li>');
    
}

function deleteFromPublishList(element){
    
    $( element ).closest("li").remove();
    
}

//Change ext in textbox
function tcodeFmt(src, extLbl) {
    if (publisherTranscodeOptions[$( src ).val()].filetype){
        $('#'+extLbl).text('.'+publisherTranscodeOptions[$( src ).val()].filetype);
    } else {
        var extSplit = $('#publishFileList li div').text().split('.');
        $('#'+extLbl).text('.'+extSplit[extSplit.length-1]);
    }
}

function uploadProtocol() {
    $('#uploadUriProto').text($('#uploadProtocol').val());
}

function burnDisc(resume){
    
    var fileList = [];
    $('#publishFileList li div').each(function() {
        fileList.push($( this ).text());
    });
    
    var menu = $('#discMenuList').val();
    
    socket.emit('publisher_burnDisc', {resume:resume, sourceFNames:fileList, menu:menu});
}

function uploadFile(resume){
    
    var fileList = [];
    $('#publishFileList li div').each(function() {
        fileList.push($( this ).text());
    });
    
    var proto = $("#uploadProtocol").val();
    var uri   = $("#uploadURI"     ).val();
    var user  = $("#uploadUser"    ).val();
    var pwd   = $("#uploadPwd"     ).val();
    var fname = $("#uploadOutName" ).val();
    var tcode = publisherTranscodeOptions[$('#uploadTranscode').val()];
    
    socket.emit('publisher_uploadFile', { resume:resume,sourceFNames:fileList,destFName:fname,
                                        transcode:tcode,protocol:proto,server:uri,username:user,password:pwd});
}

function copyFile(resume){
    
    var fileList = [];
    $('#publishFileList li div').each(function() {
        fileList.push($( this ).text());
    });
    
    var uri =   $("#fileDestDevice").val();
    var fname = $("#fileOutName"   ).val();
    var tcode = publisherTranscodeOptions[$('#fileTranscode').val()];
    
    socket.emit('publisher_copyFile', { resume:resume,sourceFNames:fileList,destFName:fname,
                                        transcode:tcode,device:uri});
}

function cancelPublish(){
    socket.emit('publisher_cancel');
}

function clearPubError(){
    $('#pubErrBackBtn').hide();
    $('#pubCancelBtn').show();
    $('#pubCurrentProgress').removeClass('progress-bar-danger');
    $('#pubCurrentProgress').addClass('progress-bar-primary active');
    publisherStatus.status = 0;
    publisherStatus.complete = 0;
    publisherErrConfirm = 0;
    guiPublishProgress();
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
    socket.on("mediaplayer_update", function (status) {onMplayerUpdate(status);});
    socket.on("videocaller_update", function (status) {onVcallerUpdate(status);});
    socket.on("publisher_update", function (status) {onPublisherUpdate(status);});
    socket.on("publisher_fileList", function (list) {console.log(list); onFileList(list);});
    socket.on("publisher_removableDisks", function (list) {console.log(list); onRemovableList(list);});
}

/**
 * Closes sio connection.
 */
window.onbeforeunload = function(e) {
    socket.disconnect();
};

/**
 * Prevents propagation of a given event.
 */
function absorbEvent_(event) {
    var e = event || window.event;
    e.preventDefault && e.preventDefault();
    e.stopPropagation && e.stopPropagation();
    e.cancelBubble = true;
    e.returnValue = false;
    return false;
}

/**
 * Generates an Audio Mixer, adding it to the aMixers dict
 * id           is the unique ID of the mixer and used as a key in the aMixers dict.
 * channels     is an array of channel objects, each with structure {name:'Disp-Name', id:0}.
 *              If there is more than 1 entry a dropdown menu will apear.
 * defaultCh    is the ID of the default channel. Only used if channels has >1 entry.
 * fader        is a boolean value for whether to display the fader or not.
 * mute         is a boolean value for whether to display the mute button or not.
 * levels       is a boolean value for whether to display the levels or not.
 */
function generateAMixer(id, channels, defaultCh, fader, mute, levels){
    //TODO
    var mixerId = String(id);
    var mixerHtml = ''
    if(fader) {
        mixerHtml +=    '<div class="amixer-volume-div volume-enabled">\n'+
                        '    <div class="fader-centerline"></div>\n'+
                        '    <div class="btn-primary volume-fader"></div>\n'+
                        '    <div class="volume-hitbox"></div>\n'+
                        '</div>\n';
    }
    mixerHtml +=        '<div class="amixer-levels-div levels-enabled">\n';
    if(mute) {
        mixerHtml +=    '    <button type="button" class="btn btn-tall btn-default btn-mute"\n'+
                        '            onclick="setAtemAudioMute('+mixerId+')">-</button>';
    }
    if(levels){
        mixerHtml +=    '    <div class="level-bar level-left">\n'+
                        '        <div class="level-ref ref-normal"></div>\n'+
                        '        <div class="level-ref ref-high"></div>\n'+
                        '        <div class="level-ref ref-over"></div>\n'+
                        '        <div class="level-value"></div>\n'+
                        '    </div>\n'+
                        '    <div class="level-bar level-right">\n'+
                        '        <div class="level-ref ref-normal"></div>\n'+
                        '        <div class="level-ref ref-high"></div>\n'+
                        '        <div class="level-ref ref-over"></div>\n'+
                        '        <div class="level-value"></div>\n'+
                        '    </div>\n'+
                        '</div>\n';
    }
    if(channels.length != 1){
        mixerHtml +=    '<select class="form-control amixer-channel" onchange="guiAudioChannel('+id+')">\n';
        for (var i=0; i<channels.length; i++) {
            if (channels[i].id == defaultCh) {
                mixerHtml +=  '    <option value="'+channels[i].id+'" selected="True">'+channels[i].name+'</option>\n';
            } else {
                mixerHtml +=  '    <option value="'+channels[i].id+'">'+channels[i].name+'</option>\n';
            }
        }
        mixerHtml +=    '</select>';
    } else {
        mixerHtml +=    '<div class="amixer-channel-div">'+channels[0].name+'</div>\n'+
                        '<input class="amixer-channel" type="hidden" value="'+channels[0].id+'" />';
    }
    
    // Construct DOM
    var newMixer = $(mixerHtml);
    
    // Attach Listeners
    var hitbox = newMixer.filter('div.amixer-volume-div').find('div.volume-hitbox');
    hitbox.mousedown(function(ev) {volInitChange(ev,mixerId);});
    hitbox.mousemove(function(ev) {volChange(ev,mixerId);});
    hitbox.mouseleave(function(ev) {volEndChange(mixerId);});
    hitbox.mouseup(function(ev) {volEndChange(mixerId);});
    hitbox.on({ 'touchstart touchmove touchend touchcancel' : absorbEvent_ });

    // Add to dict
    aMixers[mixerId] = newMixer;
    
    return newMixer;
}

/**
 * Connects GUI elements to vars for easy access
 */
function setupGui(){
    
    //Populate mixer placeholders
    $('div.amixer').each(function() {
        var id = $( this ).attr('id');
        var channels = mixerAChnls;
        var defaultCh = '';
        var fader = true;
        var mute = true;
        var levels = true;
        var classList = $( this ).attr('class').split(/\s+/);
        
        // Extract Default Channel
        for (var i=0; i<classList.length; i++){
            if(classList[i].startsWith('chnl-default-')){
                defaultCh = classList[i].substring(13);
            }
        }
        
        // Fixed Channel
        if ($( this ).hasClass('chnl-fixed')){
            if (defaultCh != '0'){
                for (var i=0; i<mixerAChnls.length; i++){
                    if(mixerAChnls[i].id == defaultCh){
                        channels = [mixerAChnls[i]];
                    }
                }
            } else {
                channels = [{id:"0", name:"MASTER"}];
            }
        }
        
        // Disable options
        if ($( this ).hasClass('mixer-nofader')){
            fader = false;
        }
        if ($( this ).hasClass('mixer-nomute')){
            mute = false;
        }
        if ($( this ).hasClass('mixer-nolevels')){
            levels = false;
        }
        
        // Generate mixer and render it into this DIV
        var mixer = generateAMixer(id, channels, defaultCh, fader, mute, levels);
        $( this ).append(mixer);
    });
    
    // Connect PTZ sliders
    $('div.ptz-pan-div').each(function() {
        
        var hitbox = $( this ).find('div.ptz-hitbox');
        var slider = $( this ).find('.ptz-slider');
        var id = String($( this ).attr('id'));
        
        hitbox.mousedown(function(ev) {ptzInitPan(ev,id);});
        hitbox.mousemove(function(ev) {ptzPan(ev,id);});
        hitbox.mouseleave(function(ev) {ptzReset(id);});
        hitbox.mouseup(function(ev) {ptzReset(id);});
        hitbox.on({ 'touchstart touchmove touchend touchcancel' : absorbEvent_ });
        
        slider.css('top', ((hitbox.outerHeight()/2)-(slider.outerHeight()/2))+'px');
        slider.css('left', ((hitbox.outerWidth()/2)-(slider.outerWidth()/2))+'px');
        
    });
    $('div.ptz-zoom-div').each(function() {
        
        var hitbox = $( this ).find('div.ptz-hitbox');
        var slider = $( this ).find('.ptz-slider');
        var id = String($( this ).attr('id'));
        
        hitbox.mousedown(function(ev) {ptzInitZoom(ev,id);});
        hitbox.mousemove(function(ev) {ptzZoom(ev,id);});
        hitbox.mouseleave(function(ev) {ptzReset(id);});
        hitbox.mouseup(function(ev) {ptzReset(id);});
        hitbox.on({ 'touchstart touchmove touchend touchcancel' : absorbEvent_ });
        
        slider.css('top', ((hitbox.outerHeight()/2)-(slider.outerHeight()/2))+'px');
        
    });
    
    
    // Connect PTZ buttons
    var ptzbtn = $('button.ptz-pan-left');
    ptzbtn.mousedown(function(ev) {ptzPan(null,'left');});
    ptzbtn.mouseleave(function(ev) {ptzReset(null);});
    ptzbtn.mouseup(function(ev) {ptzReset(null);});
    ptzbtn.on({ 'touchstart touchmove touchend touchcancel' : absorbEvent_ });
    
    ptzbtn = $('button.ptz-pan-right');
    ptzbtn.mousedown(function(ev) {ptzPan(null,'right');});
    ptzbtn.mouseleave(function(ev) {ptzReset(null);});
    ptzbtn.mouseup(function(ev) {ptzReset(null);});
    ptzbtn.on({ 'touchstart touchmove touchend touchcancel' : absorbEvent_ });
    
    ptzbtn = $('button.ptz-tilt-up');
    ptzbtn.mousedown(function(ev) {ptzPan(null,'up');});
    ptzbtn.mouseleave(function(ev) {ptzReset(null);});
    ptzbtn.mouseup(function(ev) {ptzReset(null);});
    ptzbtn.on({ 'touchstart touchmove touchend touchcancel' : absorbEvent_ });
    
    ptzbtn = $('button.ptz-tilt-down');
    ptzbtn.mousedown(function(ev) {ptzPan(null,'down');});
    ptzbtn.mouseleave(function(ev) {ptzReset(null);});
    ptzbtn.mouseup(function(ev) {ptzReset(null);});
    ptzbtn.on({ 'touchstart touchmove touchend touchcancel' : absorbEvent_ });
    
    ptzbtn = $('button.ptz-zoom-tele');
    ptzbtn.mousedown(function(ev) {ptzZoom(null,'tele');});
    ptzbtn.mouseleave(function(ev) {ptzReset(null);});
    ptzbtn.mouseup(function(ev) {ptzReset(null);});
    ptzbtn.on({ 'touchstart touchmove touchend touchcancel' : absorbEvent_ });
    
    ptzbtn = $('button.ptz-zoom-wide');
    ptzbtn.mousedown(function(ev) {ptzZoom(null,'wide');});
    ptzbtn.mouseleave(function(ev) {ptzReset(null);});
    ptzbtn.mouseup(function(ev) {ptzReset(null);});
    ptzbtn.on({ 'touchstart touchmove touchend touchcancel' : absorbEvent_ });
    
}

if (!(window.WebSocket)){
     alert("BROWSER NOT SUPPORTED");
}
