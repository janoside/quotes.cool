# Server Setup

(Start with Ubuntu 20.04 image)


Basic setup

	apt update
	apt upgrade
	
	# install NodeVersionManager (nvm)
	curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh | bash
	
	# install misc tools
	apt install net-tools iotop ncdu unzip
	
	# install npm, nginx, certbot
	apt install nginx python3-certbot-nginx
	
	# install pm2
	npm install -g pm2
	
	ssh-keygen -b 4096
	# upload ~/.ssh/id_rsa.pub to github
	
	# set hostname
	hostnamectl set-hostname XXX_HOSTNAME

Install MongoDB
	  
	# install mongodb
	# ref: https://docs.mongodb.com/manual/tutorial/install-mongodb-on-ubuntu/
	wget -qO - https://www.mongodb.org/static/pgp/server-5.0.asc | sudo apt-key add -
	echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/5.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-5.0.list
	apt update
	apt-get install -y mongodb-org
	systemctl start mongod

Configure MongoDB
	  
	# configure admin user and enable authentication
	# ref: https://www.digitalocean.com/community/tutorials/how-to-secure-mongodb-on-ubuntu-20-04
	# ref2 (for 4 superuser roles): https://stackoverflow.com/questions/22638258/create-superuser-in-mongo
	mongosh   # launches mongo shell
	  
	mongosh >
	{
	use admin
	db.createUser({user: "admin", pwd: passwordPrompt(), roles: [{ role: "userAdminAnyDatabase", db: "admin" }, { role: "readWriteAnyDatabase", db: "admin" }, { role: "dbAdminAnyDatabase", db: "admin" }, { role: "clusterAdmin", db: "admin" }]})
	db.createUser({user: "backups", pwd: passwordPrompt(), roles: [{ role: "readAnyDatabase", db: "admin" }]})
	exit
	}
	  
	vim /etc/mongod.conf
	# uncomment the `security:` prompt
	# add the line `authorization: "enabled"` (indented 2 spaces) underneath `security:`
	service mongod restart
	  
	# verify authentication is enabled
	mongosh   # launches mongo shell
	
	mongosh > show databases; # should return no results since default mongo user has no permissions
	mongosh > exit
	
	mongosh -u admin -p
	

Clone and Start
	
	git clone https://github.com/janoside/quotes.cool
	cd quotes.cool
	npm i
	pm2 start bin/main.js --name quotes

Configure Nginx

	wget "https://raw.githubusercontent.com/janoside/quotes.cool/master/docs/nginx-config.txt"
	mv nginx-config.txt /etc/nginx/sites-available/quotes.cool
	cd /etc/nginx/sites-enabled/
	certbot -d quotes.cool
	ln -s ../sites-available/quotes.cool .
	unlink default
	service nginx restart
	  
Configure Backups

	Ref: https://www.cloudsavvyit.com/6059/how-to-set-up-automated-mongodb-backups-to-s3/
	
	# Install AWS CLI
	# ref: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2-linux.html
	curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
	unzip awscliv2.zip
	rm awscliv2.zip
	./aws/install
	aws --version
	aws configure # enter AWS credentials
	
	wget "https://raw.githubusercontent.com/janoside/quotes.cool/master/docs/backup.sh"
	# edit backup.sh:
	# enter mongodb "backups" user password and AWS profile name (from ~/.aws/credentials file)
	
	crontab -e
	# configuration helper: https://crontab.guru/
	# add line like below (run every 3 hrs, 17-min after the hour)
	# 5 0,12 * * * /root/quotes.cool/backup.sh > /root/quotes.cool/backup.log 2>&1

