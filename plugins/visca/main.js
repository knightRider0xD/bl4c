var visca = 0;
var viscaLast = 0;
var viscaNext = 0;

var spawn  = require('child_process').spawn;
var system = null;
var sio_hooks = [];

var config = {
    'serial': '/dev/ttyUSB0'
};

exports.load = function (main_sys) {
    
    system = main_sys;
    
    system.setConfigDefaults(config);
    config = system.getConfig();
    
    for(var i=0; i<sio_hooks.length; i++){
       system.registerSioEvent(sio_hooks[i].event, sio_hooks[i].callback); 
    }
    
}

exports.unload = function () {
    quitVisca();
}

exports.notify = function (signalName, value) {
    //Do not need any updates
}

// Socket.IO Callbacks
sio_hooks.push({event:'sendPtzCmd', callback:function(ptzInfo){
    quitVisca();
    sendPtzCmd(ptzInfo);
}});
        
sio_hooks.push({event:'sendPtzRecall', callback:function(presetInfo){
    quitVisca();
    setRecallViscaMemory(presetInfo.camera,0,presetInfo.slot);
}});


function sendPtzCmd(ptzInfo){
    
    if(ptzInfo){
        viscaNext = ptzInfo;
    }
    
    if(JSON.stringify(viscaLast) === JSON.stringify(viscaNext)){ //repeat command
        return;
    }

    if(visca){
        setTimeout(function(){sendPtzCmd(null);}, 128);
        return;
    }
    
    viscaLast = viscaNext;

    if(viscaNext.zoom){
        sendViscaZoom(viscaNext.camera,viscaNext.zoom)
    } else if(viscaNext.pan || viscaNext.tilt){
        sendViscaPanTilt(viscaNext.camera,viscaNext.pan,viscaNext.tilt);
    } else {
        sendViscaPanTilt(viscaNext.camera,0,0);
        sendViscaZoom(viscaNext.camera,0);
    }
    
}

function sendViscaPanTilt(camera,panSpeed,tiltSpeed){
    
    if(exiting){return;}
    
    var cmdName = '';
    
    if(panSpeed > 24){panSpeed=24;}
    if(panSpeed < -24){panSpeed=-24;}
    if(tiltSpeed > 20){tiltSpeed=20;}
    if(tiltSpeed < -20){tiltSpeed=-20;}
    
    if(panSpeed == 0 && tiltSpeed == 0){cmdName = 'set_pantilt_stop'; panSpeed=1; tiltSpeed=1;}
    else if(panSpeed >= 0 && tiltSpeed >= 0){cmdName = 'set_pantilt_upright';}
    else if(panSpeed < 0 && tiltSpeed >= 0){cmdName = 'set_pantilt_upleft'; panSpeed*=-1;}
    else if(panSpeed >= 0 && tiltSpeed < 0){cmdName = 'set_pantilt_downright'; tiltSpeed*=-1;}
    else if(panSpeed < 0 && tiltSpeed < 0){cmdName = 'set_pantilt_downleft'; panSpeed*=-1; tiltSpeed*=-1;}
    
    visca = spawn('./visca-cli-multi', ['-d',config.serial,'camera',camera,cmdName,panSpeed,tiltSpeed],{cwd: process.cwd(), env: process.env, detached: true});
    
    var timeout = setTimeout(function(){quitVisca();}, 120);
    
    visca.on('error', function (err) {
        console.log('Failed to start send visca cmd.');
    });

    visca.on('exit', function (code) {
        clearTimeout(timeout);
        timeout = 0;
        visca = 0;
    });
}

function sendViscaZoom(camera,zoomSpeed){
    
    if(exiting){return;}
    
    var cmdName = '';
    
    if(zoomSpeed > 7){zoomSpeed=7;}
    if(zoomSpeed < -7){zoomSpeed=-7;}
    
    if(zoomSpeed >= 2){cmdName = 'set_zoom_tele_speed';}
    else if(zoomSpeed <= -2){cmdName = 'set_zoom_wide_speed'; zoomSpeed*=-1;}
    else {cmdName = 'set_zoom_stop';}
    
    visca = spawn('./visca-cli-multi', ['-d',config.serial,'camera',camera,cmdName,zoomSpeed],{cwd: process.cwd(), env: process.env, detached: true});
    
    var timeout = setTimeout(function(){quitVisca();}, 120);
    
    visca.on('error', function (err) {
        console.log('Failed to start send visca cmd.');
    });

    visca.on('exit', function (code) {
        clearTimeout(timeout);
        visca = 0;
    });
}

function setRecallViscaMemory(camera,set,slot){
    
   if(exiting || visca){return;}
   if(slot > 5 || slot < 0){return;}
   
    if(set){
            sendViscaSetMemory(camera,slot);
    } else {
            sendViscaRecallMemory(camera,slot);
    }
}

function sendViscaRecallMemory(camera,slot){
    
    if(exiting || visca){return;}
    if(slot > 5 || slot < 0){return;}
    
    visca = spawn('./visca-cli-multi', ['-d',config.serial,'camera',camera,'memory_recall',''+slot+''],{cwd: process.cwd(), env: process.env, detached: false});
    
    var timeout = setTimeout(function(){quitVisca();}, 120);
    
    visca.on('error', function (err) {
        console.log('Failed to start send visca cmd.');
    });

    visca.on('exit', function (code) {
        clearTimeout(timeout);
        visca = 0;
    });
}

function sendViscaSetMemory(camera,slot){
    
    if(exiting || visca){return;}
    if(slot > 5 || slot < 0){return;}

    visca = spawn('./visca-cli-multi', ['-d',config.serial,'camera',camera,'memory_set',slot],{cwd: process.cwd(), env: process.env, detached: true});
    
    var timeout = setTimeout(function(){quitVisca();}, 120);
    
    visca.on('error', function (err) {
        console.log('Failed to start send visca cmd.');
    });

    visca.on('exit', function (code) {
        clearTimeout(timeout);
        visca = 0;
    });
}

function sendViscaPanTiltPos(camera,panSpeed,tiltSpeed,panPos,tiltPos){
    
    if(exiting || visca){return;}
    
    if(panSpeed > 24){panSpeed=24;}
    if(panSpeed < 1){panSpeed=1;}
    if(tiltSpeed > 20){tiltSpeed=20;}
    if(tiltSpeed < 1){tiltSpeed=1;}
    if(panPos > 880){panPos=880;}
    if(panPos < -879){panPos=-879;}
    if(tiltPos > 300){tiltPos=300;}
    if(tiltPos < -299){tiltPos=-299;}
    
    visca = spawn('./visca-cli-multi', ['-d',config.serial,'camera',camera,'set_pantilt_absolute_position',panSpeed,tiltSpeed,panPos,tiltPos],{cwd: process.cwd(), env: process.env, detached: true});
    
    var timeout = setTimeout(function(){quitVisca();}, 120);
    
    visca.on('error', function (err) {
        console.log('Failed to start send visca cmd.');
    });

    visca.on('exit', function (code) {
        clearTimeout(timeout);
        visca = 0;
    });
}

function sendViscaZoomLvl(camera,zoomValue){
    
    if(exiting || visca){return;}
    
    if(zoomValue > 1023){zoomValue=1023;}
    if(zoomValue < 0){zoomValue=0;}
    
    visca = spawn('./visca-cli-multi', ['-d',config.serial,'camera',camera,'set_zoom_value',zoomValue],{cwd: process.cwd(), env: process.env, detached: true});
    
    var timeout = setTimeout(function(){quitVisca();}, 120);
    
    visca.on('error', function (err) {
        console.log('Failed to start send visca cmd.');
    });

    visca.on('exit', function (code) {
        clearTimeout(timeout);
        visca = 0;
    });
}

function quitVisca(){
    if(visca){
        visca.kill('SIGTERM');
    }
}
