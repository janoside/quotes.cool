const debug = require("debug");

const appConfig = require("./config.js");

const appUtils = require("@janoside/app-utils");
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

	await createAdminUserIfNeeded();

	return global.db;
};

const createAdminUserIfNeeded = async () => {
	// create admin user if needed
	const adminUser = await db.findOne("users", {username: appConfig.db.adminUser.username});
	if (!adminUser) {
		debugLog(`Creating admin user '${appConfig.db.adminUser.username}'...`);

		const passwordHash = await passwordUtils.hash(appConfig.db.adminUser.password);

		const adminUser = {
			username: appConfig.db.adminUser.username,
			passwordHash: passwordHash,
			roles: ["admin"]
		};

		await db.insertOne("users", adminUser);

		debugLog(`Admin user '${appConfig.db.adminUser.username}' created.`);

	} else {
		debugLog(`Admin user '${appConfig.db.adminUser.username}' already exists`);
	}
};



module.exports = {
	connect: connect
}