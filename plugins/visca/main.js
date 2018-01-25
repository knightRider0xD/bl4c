var visca = 0;
var ptzLast = 0;
var viscaLast = 0;
var viscaNext = 0;
var exiting = 0;

var spawn  = require('child_process').spawn;
var system = null;
var sio_hooks = [];

var config = {
    'serial': '/dev/ttyUSB0',
    'presets': [['Lectern','Center','W.Lead','Table','Wide','Band'],
                ['Lectern','Center','W.Lead','Table','Wide','Band']]
};

exports.load = function (main_sys) {
    
    system = main_sys;
    
    system.setConfigDefaults(config);
    config = system.getConfig();
    
    system.registerSioEvent('connected', function(){
        getPresetNames();
    });
    
    for(var i=0; i<sio_hooks.length; i++){
       system.registerSioEvent(sio_hooks[i].event, sio_hooks[i].callback); 
    }
    
    exiting = 0;
    
}

exports.unload = function () {
    exiting = 1;
    quitVisca();
}

exports.notify = function (signalName, value) {
    //Do not need any updates
}

// Socket.IO Callbacks
sio_hooks.push({event:'doPtzCmd', callback:function(ptzInfo){
    doPtzCmd(ptzInfo);
}});
        
sio_hooks.push({event:'recallPtzPreset', callback:function(presetInfo){
    setRecallViscaMemory(presetInfo.camera,0,presetInfo.slot);
}});

sio_hooks.push({event:'getPtzPresetNames', callback:function(){
    getPresetNames();
}});

sio_hooks.push({event:'savePtzPreset', callback:function(presetInfo){
    setRecallViscaMemory(presetInfo.camera,1,presetInfo.slot);
    setPresetName(presetInfo.camera,presetInfo.slot,presetInfo.name);
}});


function doPtzCmd(ptzInfo){
    
    if(ptzInfo.zoom){
        ptzLast = 'zoom';
        doViscaZoom(ptzInfo.camera,ptzInfo.zoom)
    } else if(ptzInfo.pan || ptzInfo.tilt){
        ptzLast = 'pantilt';
        doViscaPanTilt(ptzInfo.camera,ptzInfo.pan,ptzInfo.tilt);
    } else {
        if (ptzLast=='zoom'){
            doViscaZoom(ptzInfo.camera,0);
        } else if(ptzLast=='pantilt'){
            doViscaPanTilt(ptzInfo.camera,0,0);
        }
    }
    
}

function doViscaPanTilt(camera,panSpeed,tiltSpeed){
    
    if(exiting){return;}
    
    var cmdName = '';
    
    if(panSpeed > 24){panSpeed=24;}
    if(panSpeed < -24){panSpeed=-24;}
    if(tiltSpeed > 20){tiltSpeed=20;}
    if(tiltSpeed < -20){tiltSpeed=-20;}
    
    if(panSpeed == 0 && tiltSpeed == 0){cmdName = 'set_pantilt_stop'; panSpeed=1; tiltSpeed=1;}
    else if(panSpeed > 0 && tiltSpeed > 0){cmdName = 'set_pantilt_upright';}
    else if(panSpeed < 0 && tiltSpeed > 0){cmdName = 'set_pantilt_upleft'; panSpeed*=-1;}
    else if(panSpeed > 0 && tiltSpeed < 0){cmdName = 'set_pantilt_downright'; tiltSpeed*=-1;}
    else if(panSpeed < 0 && tiltSpeed < 0){cmdName = 'set_pantilt_downleft'; panSpeed*=-1; tiltSpeed*=-1;}
    else if(panSpeed > 0 && tiltSpeed == 0){cmdName = 'set_pantilt_right'; tiltSpeed=1;}
    else if(panSpeed < 0 && tiltSpeed == 0){cmdName = 'set_pantilt_left'; panSpeed*=-1; tiltSpeed=1;}
    else if(panSpeed == 0 && tiltSpeed > 0){cmdName = 'set_pantilt_up'; panSpeed=1;}
    else if(panSpeed == 0 && tiltSpeed < 0){cmdName = 'set_pantilt_down'; panSpeed=1; tiltSpeed*=-1;}
    
    console.log(system.pluginDir+' ./visca-cli-multi -d '+config.serial+' camera '+camera+' '+cmdName+' '+panSpeed+' '+tiltSpeed);
    
    sendViscaCmd(['-d',config.serial,'camera',camera,cmdName,panSpeed,tiltSpeed]);
    
}

function doViscaZoom(camera,zoomSpeed){
    
    if(exiting){return;}
    
    var cmdName = '';
    
    if(zoomSpeed > 7){zoomSpeed=7;}
    if(zoomSpeed < -7){zoomSpeed=-7;}
    
    if(zoomSpeed >= 2){cmdName = 'set_zoom_tele_speed';}
    else if(zoomSpeed <= -2){cmdName = 'set_zoom_wide_speed'; zoomSpeed*=-1;}
    else {cmdName = 'set_zoom_stop';}
    
    sendViscaCmd(['-d',config.serial,'camera',camera,cmdName,zoomSpeed]);
}

function setRecallViscaMemory(camera,set,slot){
    
   if(exiting){return;}
   if(slot > 5 || slot < 0){return;}
   
    if(set){
            doViscaSetMemory(camera,slot);
    } else {
            doViscaRecallMemory(camera,slot);
    }
}

function doViscaRecallMemory(camera,slot){
    
    if(exiting){return;}
    if(slot > 5 || slot < 0){return;}
    
    sendViscaCmd(['-d',config.serial,'camera',camera,'memory_recall',''+slot+'']);
    
}

function doViscaSetMemory(camera,slot){
    
    if(exiting){return;}
    if(slot > 5 || slot < 0){return;}

    sendViscaCmd(['-d',config.serial,'camera',camera,'memory_set',slot]);
    
}

function doViscaPanTiltPos(camera,panSpeed,tiltSpeed,panPos,tiltPos){
    
    if(exiting){return;}
    
    if(panSpeed > 24){panSpeed=24;}
    if(panSpeed < 1){panSpeed=1;}
    if(tiltSpeed > 20){tiltSpeed=20;}
    if(tiltSpeed < 1){tiltSpeed=1;}
    if(panPos > 880){panPos=880;}
    if(panPos < -879){panPos=-879;}
    if(tiltPos > 300){tiltPos=300;}
    if(tiltPos < -299){tiltPos=-299;}
    
    sendViscaCmd(['-d',config.serial,'camera',camera,'set_pantilt_absolute_position',panSpeed,tiltSpeed,panPos,tiltPos]);

}

function doViscaZoomLvl(camera,zoomValue){
    
    if(exiting){return;}
    
    if(zoomValue > 1023){zoomValue=1023;}
    if(zoomValue < 0){zoomValue=0;}
    
    sendViscaCmd(['-d',config.serial,'camera',camera,'set_zoom_value',zoomValue]);
}

function sendViscaCmd(commandArgs){
    
    if(commandArgs){
        viscaNext = commandArgs;
    }
    
    if(visca){// || JSON.stringify(viscaLast) === JSON.stringify(viscaNext)){ // busy or repeat command
        return;
    }
    
    visca = spawn('./visca-cli-multi', viscaNext,{cwd: system.pluginDir, env: process.env, detached: true});
    
    var timeout = setTimeout(function(){quitVisca();}, 2000);
    
    //Log command
    viscaLast = viscaNext;
    viscaNext = 0;
    
    visca.on('error', function (err) {
        console.log('Failed to start send visca cmd.');
    });

    visca.on('exit', function (code) {
        clearTimeout(timeout);
        visca = 0;
        if(viscaNext){
            sendViscaCmd(null);
        }
    });
    
}


function quitVisca(){
    if(visca){
        visca.kill('SIGTERM');
    }
}

function getPresetNames(){
    system.doSioEmit('presets', config.presets);
}

function setPresetName(camera,slot,name){
    config.presets[camera-1][slot] = name;
    system.setConfig('presets', config.presets);
    system.doSioEmit('presets', config.presets);
}
