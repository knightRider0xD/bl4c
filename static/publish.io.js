
var socket = 0;
var publisherStatus = {status:0,complete:0,lastDiscStatus:0,lastFileStatus:0};

guiElements = {pages:[],
    tabs:[],
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
    currentProgress:0}


    
function onPublisherUpdate(status){
    publisherStatus = status;
    //console.log(status);
    
    guiPublishProgress(); //set program
    
}

function onRecordingList(list){
    
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

//camera stuff


/**
 * Opens a socket.io connection back to the server
 * requires socket.io client library to already be loaded
 */
function connectServer(){
    //setup socket
    socket = io();
    
    //connect socket events
    socket.on("connect", function () {console.log("Connected!"); socket.emit('getRecordingList');});
    socket.on("publisherUpdate", function (status) {console.log(status); onPublisherUpdate(status);});
    socket.on("recordingList", function (list) {console.log(list); onRecordingList(list);});
    
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
    guiElements.progressText = document.getElementById("progressText");
    guiElements.currentProgress = document.getElementById("currentProgress");
    
}

if (!(window.WebSocket)){
     alert("BROWSER NOT SUPPORTED");
}
