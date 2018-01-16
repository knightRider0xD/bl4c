var videocallerStatus = {system:0,login:0,call:0};
var browser = 0;

var spawn  = require('child_process').spawn;
var system = null;
var sio_hooks = [];

var aLoginCredentials = 0;
var aDialContact = 0;

/*var config = {
    "test": "default"
};*/

exports.load = function (main_sys) {
    
    system = main_sys;
    
    /*system.setConfigDefaults(config);
    config = system.getConfig();*/
    
    system.registerSioEvent('connected', function(){
        console.log("Test plugin callback for Socket.IO connected event");
    });
    
    for(var i=0; i<sio_hooks.length; i++){
       system.registerSioEvent(sio_hooks[i].event, sio_hooks[i].callback); 
    }
    
}

exports.unload = function () {
    if(browser){
        closeSession();
    }
    console.log("Videocaller unloaded");
}

exports.notify = function (signalName, value) {
    console.log("Test plugin notified of signal "+signalName+" with value "+value);
}

// Login
sio_hooks.push({event:'caller_login', callback:function(login){
    aLoginCredentials = login;
    if(login.service=='messenger'){
        startBrowserEnv('https://www.messenger.com/login/';
    } else if(login.service=='hangouts'){
        startBrowserEnv('https://hangouts.google.com/');
    } else {
        system.doSioEmit('update', videocallerStatus);
    }
}});

// Start Call
sio_hooks.push({event:'caller_start_call', callback:function(contact){
    if(videocallerStatus.login == 1){
        aDialContact = {'contact':contact};
        startCall(contact);
    } else if(videocallerStatus.login == 0 && creds){
        aDialContact = {'contact':contact};
        sendLogin(creds.user, creds.pass);
    } else {
        system.doSioEmit('update', videocallerStatus);
    }
}});

// End Call
sio_hooks.push({event:'caller_end_call', callback:function(){
    aDialContact = 0;
    if(videocallerStatus.call){
        endCall();
    } else {
        system.doSioEmit('update', videocallerStatus);
    }
}});

sio_hooks.push({event:'client_auth_update', callback:function(status){
    videocallerStatus.login = status;
    // 0 Awaiting login
    if(status == 0 && aLoginCredentials){
        sendLogin(creds.user, creds.pass);
    // 1 Authenticated
    } else if(status == 1 && aDialContact && videocallerStatus.call == 0){
        startCall(call.contact);   
    }
    system.doSioEmit('update', videocallerStatus);
}});

sio_hooks.push({event:'client_call_update', callback:function(status){
    videocallerStatus.call = status;
    system.doSioEmit('update', videocallerStatus);
}});
    


function startBrowserEnv(uri){
    if(!system.acquireResource('display')){
        system.doSioEmit('update', videocallerStatus);
        return;
    }
    
    browser = spawn('chromium',['--kiosk',],{cwd: process.cwd(), env: process.env, detached: true});
    
    videocallerStatus.system = 1;
    system.doSioEmit('update', videocallerStatus);
    
    browser.on('exit', function (code) {
        console.log('Browser Closed');
        browser = 0;
        aLoginCredentials = 0;
        aDialContact = 0;
        videocallerStatus = {system:0,login:0,call:0};
        system.releaseResource('display');
        system.doSioEmit('update', videocallerStatus);
    });
}

function sendLogin(user, pass){
    system.doSioEmitTarget(['::1','127.0.0.1','localhost'],'login', {user:user, pass:pass});
}

function startCall(contact){
    system.doSioEmitTarget(['::1','127.0.0.1','localhost'],'startCall', {contact:contact});
}

function endCall(){
    system.doSioEmitTarget(['::1','127.0.0.1','localhost'],'endCall', '');
}

function closeSession(){
    aLoginCredentials = 0;
    browser.kill('SIGTERM');
}
