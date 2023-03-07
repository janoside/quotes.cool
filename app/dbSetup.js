const debug = require("debug");

const appConfig = require("./config.js");

const appUtils = require("./app-utils");
const passwordUtils = appUtils.passwordUtils;

const mongoClient = appUtils.mongoClient;



var debugLog = debug("app:db");
 


const dbConfig = appConfig.db;

const dbSchema = [
	{
		name: "users",
		indexes: [
			{
				name: "username_1",
				key: { "username":1 },
				properties: { unique:true }
			},
			{
				name:"roles_1",
				key: { "roles":1 }
			}
		]
	},
	{
		name: "quotes",
		indexes: [
			{
				name: "userId_1_visibility_1",
				key: { "userId": 1, "visibility": 1 }
			},
			{
				name: "username_1_visibility_1",
				key: { "username": 1, "visibility": 1 }
			},
			{
				name: "date_1",
				key: { "date": 1 }
			},
			{
				name: "speakers_1",
				key: { "speakers": 1}
			},
			{
				name: "linkSite_1",
				key: { "linkSite": 1}
			},
			{
				name: "tags_1",
				key: { "tags": 1}
			},
			{
				name: "importDate_1_importIndex_1",
				key: { "importDate": 1, "importIndex": 1 }
			},
			{
				name: "importDate_1_importIndex_1_date_1",
				key: { "importDate": 1, "importIndex": 1, "date": 1 }
			}
		]
	},
	{
		name: "quoteLists",
		indexes: [
			{
				name: "userId_1",
				key: { "userId": 1 }
			},
			{
				name: "username_1",
				key: { "username": 1 }
			},
			{
				name: "name_1",
				key: { "name": 1 }
			},
			{
				name: "date_1",
				key: { "date": 1 }
			}
		]
	}
];


const connect = async () => {
	global.db = await mongoClient.createClient(dbConfig.host, dbConfig.port, dbConfig.username, dbConfig.password, dbConfig.name, dbSchema);

	await mongoClient.createAdminUserIfNeeded(db, appConfig.db.adminUser.username, appConfig.db.adminUser.password);
	await runMigrationsAsNeeded();

	return global.db;
};


const runMigrationsAsNeeded = async () => {
	const migrations = [
		// example of how to add a property
		/*{
			name: "addTestPropA",
			collection: "items",
			filter: { hasImage: true },
			updateFunc: {$set: {testXyz:"123"}}
		},*/
		
		// example of how to remove a property
		/*{
			name: "removeTestPropA",
			collection: "items",
			filter: { },
			updateFunc: {$unset: {testXyz:""}}
		},*/

		{
			name: "add-user-roles",
			collection: "users",
			filter: { roles: { $exists: false }},
			updateFunc: { $set: { roles: [] }}
		}
	];


	await mongoClient.runMigrationsAsNeeded(db, migrations);
};



module.exports = {
	connect: connect
}