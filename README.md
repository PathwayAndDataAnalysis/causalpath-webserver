CausalPath: Causality Analysis for Proteomics Profiles
=======================================


Installation
------------

Install node.js, mongodb and redis servers first.

Node:

>curl -sL
[*https://deb.nodesource.com/setup\_0.12*](https://deb.nodesource.com/setup_0.12)
>| sudo -E bash -

>sudo apt-get install -y nodejs

Redis:

>sudo apt-get update

>sudo apt-get install build-essential

>sudo apt-get install tcl8.5

wget
[*http://download.redis.io/releases/redis-stable.tar.gz*](http://download.redis.io/releases/redis-stable.tar.gz)

>tar xzf redis-stable.tar.gz

>cd redis-stable

>make

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

>git clone -b CausalPath
[*https://github.com/fdurupinar/codex.git*](https://github.com/fdurupinar/codex.git)

>cd codex

>npm install

Run server:

>node server

In order to open a client:

Enter “http://localhost:3001” to the address bar of your browser. <span
id="_lzkutpoc5320" class="anchor"></span>
