#!/bin/bash
sleep 24

#bmdcapture -m 9 -A 2 -F nut -f pipe:1 | cvlc - --sout='#transcode{vcodec=mp2v,vb=12000,scale=Auto,acodec=mpga,ab=320,channels=2,samplerate=44100}:standard{access=http,mux=ts,dst=192.168.10.232:5000}'

#bmdcapture -m 9 -A 2 -F nut -f pipe:1 | cvlc - --sout='#transcode{vcodec=hevc,venc=ffmpeg{codec=libx265,options={preset=ultrafast,x265-params={lossless=1}}},vfilter=deinterlace,deinterlace-mode=bob,scale=Auto,acodec=opus,ab=320,channels=2,samplerate=44100,audio-sync=enable}:standard{access=http,mux=mkv,dst=192.168.10.232:5000}'

#bmdcapture -m 9 -A 2 -F nut -f pipe:1 | cvlc - --sout='#transcode{vcodec=h264,venc=x264{crf=0,preset=ultrafast,profile=high422},vfilter=deinterlace,deinterlace-mode=bob,scale=Auto,acodec=mp3,ab=320,channels=2,samplerate=44100,audio-sync=enable}:standard{access=http,mux=mkv,dst=192.168.10.232:5000}'

bmdcapture -m 9 -A 2 -F nut -f pipe:1 | cvlc - --sout='#transcode{vcodec=h264,venc=x264{crf=0,preset=ultrafast,profile=high422},vfilter=deinterlace,deinterlace-mode=bob,scale=Auto,acodec=opus,ab=320,channels=2,samplerate=44100,audio-sync=enable}:standard{access=http,mux=mkv,dst=192.168.10.232:5000}'
