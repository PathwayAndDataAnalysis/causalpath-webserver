A Web Server for [CausalPath](https://github.com/PathwayAndDataAnalysis/causalpath)
=======================================


Installation
------------

Install node.js and mongodb servers first.

Node:

>curl -sL
[*https://deb.nodesource.com/setup\_0.12*](https://deb.nodesource.com/setup_0.12)
>| sudo -E bash -

>sudo apt-get install -y nodejs

Mongo:

>sudo apt-key adv --keyserver
hkp://[*keyserver.ubuntu.com:80*](http://keyserver.ubuntu.com/) --recv
EA312927

>echo "deb
[*http://repo.mongodb.org/apt/ubuntu*](http://repo.mongodb.org/apt/ubuntu)
trusty/mongodb-org/3.2 multiverse" | sudo tee
/etc/apt/sources.list.d/mongodb-org-3.2.list

>sudo apt-get update

>sudo apt-get install -y mongodb-org

If mongo does not work:

>sudo apt-get install upstart-sysv

Get project from github:

>git clone
[*https://github.com/PathwayAndDataAnalysis/causalpath-webserver.git*](https://github.com/PathwayAndDataAnalysis/causalpath-webserver.git)

>cd causalpath-webserver

>npm install

Run server:

>npm run start

In order to open a client:

Enter “http://localhost:3001” to the address bar of your browser. <span
id="_lzkutpoc5320" class="anchor"></span>
