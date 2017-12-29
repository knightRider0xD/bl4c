var spawn  = require('child_process').spawn;
var system = null;
var sio_hooks = [];

var config = {
    "test": "default"
};

exports.load = function (main_sys) {
    
    system = main_sys;
    
    system.setConfigDefaults(config);
    config = system.getConfig();
    
    system.registerSioEvent('connected', function(){
        console.log("Test plugin callback for Socket.IO connected event");
    });
    
    for(var i=0; i<sio_hooks.length; i++){
       system.registerSioEvent(sio_hooks[i].event, sio_hooks[i].callback); 
    }
    
}

exports.unload = function () {
    console.log("Test plugin unload called");
}

exports.notify = function (signalName, value) {
    console.log("Test plugin notified of signal "+signalName+" with value "+value);
}

// Socket.IO Callbacks
sio_hooks.push({event:'sio', callback:function(){
    doTestReply();
}});

sio_hooks.push({event:'setting', callback:function(){
    changeSetting();
}});

sio_hooks.push({event:'config', callback:function(){
    printConfig();
}});
    

function doTestReply(){
    system.doSioEmit('reply', "reply value");
}

function changeSetting(){
    system.setConfig('test', "new");
}

function printConfig(){
    var globals = system.getGlobalConfig();
    console.log(globals);
    config = system.getConfig();
    console.log(config);
}
