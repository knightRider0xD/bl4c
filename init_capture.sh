!#/bin/bash
sleep 24
bmdcapture -m 9 -A 2 -F nut -f pipe:1 | cvlc - --sout='#transcode{vcodec=mp2v,vb=12000,scale=Auto,acodec=mpga,ab=320,channels=2,samplerate=44100}:standard{access=http,mux=ts,dst=192.168.10.232:5000}'
