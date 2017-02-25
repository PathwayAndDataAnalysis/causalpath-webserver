git pull
cd causalpath
mvn clean install
mvn assembly:single
cp ./target/causalpath.jar ../causalpath.jar
cd ..