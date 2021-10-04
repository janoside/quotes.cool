## Mongo Administration

To restore from backups `tgz` files (containing `bson` files):

    mongorestore -u admin -d DATABASE_NAME -c COLLECTION_NAME --authenticationDatabase admin COLLECTION_NAME.bson



Uninstall mongodb

    service mongod stop
	apt-get purge mongodb-org*
	rm -r /var/log/mongodb
	rm -r /var/lib/mongodb
