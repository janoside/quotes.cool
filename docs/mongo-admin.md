To restore from backups `tgz` files (containing `bson` files):

    mongorestore -u admin -d DATABASE_NAME -c COLLECTION_NAME --authenticationDatabase admin COLLECTION_NAME.bson
