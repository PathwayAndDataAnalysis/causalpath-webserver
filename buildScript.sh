sudo apt-get update
sudo apt-get install zip
sudo git pull origin master
# if below gives a permission denied error, use sudo two times "sudo sudo npm install"
sudo npm install
cd jar
# Use the below line if this is first time installation of causalpath-webserver
# git submodule add -f https://github.com/PathwayAndDataAnalysis/causalpath.git
cd causalpath
sudo git pull origin master
sudo mvn clean install
sudo mvn assembly:single
cp ./target/causalpath.jar ../causalpath.jar
cd ..
java -jar causalpath.jar params-in-json
cd ..
sudo mkdir analysisOut
cd analysisOut
sudo mkdir demo
cd ..
sudo PORT=80 npm run start
