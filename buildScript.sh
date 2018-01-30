sudo git pull origin master
cd jar
cd causalpath
sudo git pull origin master
sudo mvn clean install
sudo mvn assembly:single
cp ./target/causalpath.jar ../causalpath.jar
cd ..
cd ..
sudo mkdir analysisOut
cd analysisOut
sudo mkdir demo
cd ..
sudo PORT=80 node server

