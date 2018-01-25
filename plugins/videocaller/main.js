var videocallerStatus = {system:0,login:0,call:0,status:''};
var resolution = {"width":1024,"height":768};
var browser = 0;
var page = 0;

var spawn  = require('child_process').spawn;
var puppeteer = require('puppeteer');
var system = null;
var sio_hooks = [];

var sessionData = 0;
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
    
    resolution = system.getGlobalConfig('resolution');
    
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
sio_hooks.push({event:'login', callback:function(login){
    console.log('Login Request Received '+JSON.stringify(login));
    sessionData = login;
    if(login.service=='messenger'){
        startBrowserEnv('https://www.messenger.com/login/',messengerLogin);
    } else if(login.service=='hangouts'){
        startBrowserEnv('https://accounts.google.com/signin/v2/identifier?continue=https://hangouts.google.com/&followup=https://hangouts.google.com/',hangoutsLogin);
    } else if(login.service=='skype'){
        startBrowserEnv('https://web.skype.com/',skypeConnect);
    } else {
        system.doSioEmit('update', videocallerStatus);
    }
}});

// Start Call
sio_hooks.push({event:'start_call', callback:function(contact){
    console.log('Call Start Request Received '+JSON.stringify(contact));
    if(!sessionData){
        system.doSioEmit('update', videocallerStatus);
        return;
    }
    
    if(sessionData.service == 'hangouts'){
        hangoutsStartCall();
    } else if(sessionData.service == 'messenger'){
        messengerStartCall(contact.contact);
    } else {
        system.doSioEmit('update', videocallerStatus);
    }
}});

// End Call
sio_hooks.push({event:'end_call', callback:function(){
    console.log('Call End Request Received.');
    if(!sessionData || videocallerStatus.system<=0){
        system.doSioEmit('update', videocallerStatus);
        return;
    }
    
    if(sessionData.service == 'hangouts'){
        hangoutsEndCall();
    } else if(sessionData.service == 'messenger'){
        messengerEndCall();
    } else {
        closeSession();
    }
}});
    


function startBrowserEnv(uri,callback){
    if(!system.acquireResource('display')){
        system.doSioEmit('update', videocallerStatus);
        console.log('cannot acquire display');
        return;
    }
    
    (async() => {
        browser = await puppeteer.launch({headless: false, userDataDir: '~/.config/chromium',args: ['--start-maximized','--kiosk','--disable-infobars','--no-sandbox', '--disable-setuid-sandbox']});
        //browser = await puppeteer.launch({headless: false, args: ['--kiosk','--disable-infobars','--no-sandbox']});
        
        await browser.on('disconnected', function (code) {
            console.log('Browser Disconnected');
            browser = 0;
            page = 0;
            sessionData = 0;
            aDialContact = 0;
            videocallerStatus = {system:0,login:0,call:0,status:''};
            system.releaseResource('display');
            system.doSioEmit('update', videocallerStatus);
        });
        
        page = await browser.newPage();
        await page.setViewport({ width:resolution.width, height:resolution.height });
        await page.goto(uri);
        
        videocallerStatus.system = 1;
        videocallerStatus.status = 'Service Connected!';
        system.doSioEmit('update', videocallerStatus);
        
        await page.waitFor(200);
        
        callback();
        
    
    })();
}

function hangoutsLogin(){
    if(page){
        
        (async() => {
        
            var loginOK = 1;
            
            await page.waitForSelector('#identifierNext').catch(function () {loginOK = 0;});
            
            if(loginOK){
                await page.type('input#identifierId', sessionData.user);
                const userNextBtn = await page.$("#identifierNext");
                await userNextBtn.click();
                
                await page.waitFor(2000);
                
                await page.waitForSelector('#passwordNext').catch(function () {loginOK = 0;});
            }
                
            if(loginOK){
                await page.type('input[type="password"]', sessionData.pass);
                const passNextBtn = await page.$("#passwordNext");
                await passNextBtn.click();
                
                await page.waitFor(8000);
                
                if(!page.mainFrame().url().startsWith('https://hangouts.google.com')){
                    loginOK = 0;
                }
            }
            
            if(loginOK){
                console.log('Logged in OK');
                videocallerStatus.login = 1;
                videocallerStatus.status = 'Hangouts logged in OK.';
            } else {
                console.log('Login Fail');
                videocallerStatus.login = -1;
                videocallerStatus.status = 'Automatic Login Failed. Manual Intervention may be necessary.';
            }
            
            system.doSioEmit('update', videocallerStatus);
        
        })();
    
    }
}

function messengerLogin(){
    if(page){
        
        (async() => {
        
            var loginOK = 1;
            
            await page.waitForSelector('#email').catch(function () {loginOK = 0;});
            
            if(loginOK){
                await page.type('#email', sessionData.user);
                
                const pwdField = await page.$("#pass");
                await pwdField.type(sessionData.pass);
                await pwdField.press('Enter');
                
                await page.waitFor(8000);
                
                if(!page.mainFrame().url().startsWith('https://messenger.com/t/')){
                    loginOK = 0;
                }
            }
            
            if(loginOK){
                console.log('Logged in OK');
                videocallerStatus.login = 1;
                videocallerStatus.status = 'Messenger logged in OK.';
            } else {
                console.log('Login Fail');
                videocallerStatus.login = -1;
                videocallerStatus.status = 'Automatic Login Failed. Manual Intervention may be necessary.';
            }
            
            system.doSioEmit('update', videocallerStatus);
        
        })();
    
    }
}

function skypeConnect(){
    videocallerStatus.login = 0;
    videocallerStatus.status = 'Skype connected.';
    system.doSioEmit('update', videocallerStatus);
}

function hangoutsStartCall(){
    if(page){
     
        (async() => {
        
            await page.goto('https://hangouts.google.com/call/');
            //await page.addScriptTag({url: 'https://code.jquery.com/jquery-3.2.1.min.js'});
            
            await page.waitFor(6000);
            
            await page.$eval('div[role="dialog"] div div div[role="button"][aria-label="Close"]', (btn) => {
                btn.click();
            }).catch(function (err) {console.log(err)});
            
            await page.waitFor(6000);
            
            await page.$$eval('div[role="button"]', (btns) => {
                for(var i=0; i<btns.length; i++){
                    btns[i].style.display = "none";
                }
            }).catch(function (err) {console.log(err)});
            
            
            var fullUrl = await page.evaluate(() => window.location.href);
            
            videocallerStatus.call = 1;
            videocallerStatus.status = 'Call started!<br />Have the recipient open the following link to connect:<br /><a href="'+fullUrl+'">'+fullUrl+'</a><br />Use manual controls if call not visible.';
            system.doSioEmit('update', videocallerStatus);
            
        })();
        
    }
}

function messengerStartCall(contact){
    if(page){
     
        (async() => {
        
            await page.goto('https://www.messenger.com/videocall/incall/?peer_id='+contact+    
                            '&is_caller=true&audio_only=false&start=true');
            
            await page.waitFor(6000);
            
            const startBtn = await page.$x('//button[contains(text(),"Call")]');
            if(startBtn.length>0){
                await startBtn[0].click();
            }
            
            await page.waitFor(6000);
            
            await page.$eval('button[role="button"]', (btn) => {
                btn.parentElement.parentElement.style.display = "none";
            }).catch(function (err) {console.log(err)});
            
            videocallerStatus.call = 1;
            videocallerStatus.status = 'Call started!<br />Use manual controls if call not visible.';
            system.doSioEmit('update', videocallerStatus);
            
        })();
        
    }
}


function hangoutsEndCall(){
    if(page){
     
        (async() => {
        
            await page.$eval('div[role="button"][aria-label="Hang up"]', (btn) => {
                btn.click();
            }).catch(function (err) {console.log(err)});
            
            videocallerStatus.call = 0;
            videocallerStatus.status = 'Call ended. Closing session...';
            system.doSioEmit('update', videocallerStatus);
            
            await page.waitFor(6000);
            closeSession();
            
        })();
        
    }
}

function messengerEndCall(contact){
    if(page){
     
        (async() => {
        
            await page.$eval('div[role="button"][aria-label="End Call"]', (btn) => {
                btn.click();
            }).catch(function (err) {console.log(err)});
            
            videocallerStatus.call = 0;
            videocallerStatus.status = 'Call ended. Closing session...';
            system.doSioEmit('update', videocallerStatus);
            
            await page.waitFor(6000);
            closeSession();
            
        })();
        
    }
}

function closeSession(){
    (async() => {
        console.log("Closing Browser");
        await browser.close();
    })();
}
