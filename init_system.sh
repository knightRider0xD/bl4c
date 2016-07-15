!#/bin/bash
sleep 12
cd /home/cvuc/.video-system && forever start index.js  > /tmp/video_system.log
