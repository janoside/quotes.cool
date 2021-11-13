const debug = require("debug");
const express = require("express");
const asyncHandler = require("express-async-handler");

const ObjectId = require("mongodb").ObjectId;
const router = express.Router();

const debugLog = debug("app:rootRouter");

const app = require("../app/app.js");
const appConfig = require("../app/config.js");

const appUtils = require("@janoside/app-utils");
const utils = appUtils.utils;
const passwordUtils = appUtils.passwordUtils;


router.get("/", asyncHandler(async (req, res, next) => {
	if (req.session.user) {
		const username = req.session.user.username;

		var limit = 25;
		var offset = 0;
		var sort = "date-desc";

		if (req.query.limit) {
			limit = parseInt(req.query.limit);
		}

		if (req.query.offset) {
			offset = parseInt(req.query.offset);
		}

		if (req.query.sort) {
			sort = req.query.sort;
		}

		const dateSortVal = sort.startsWith("date-") ? (sort.endsWith("-desc") ? -1 : 1) : -1;

		const quotesCollection = await db.getCollection("quotes");

		const quoteCount = await quotesCollection.countDocuments({userId: req.session.user._id.toString()});

		const user = await db.findOne("users", {username: username});

		const quotes = await db.findMany(
			"quotes",
			{ userId: user._id.toString() },
			{
				sort: [
					["createdAt", dateSortVal],
					["importDate", dateSortVal],
					["importIndex", dateSortVal],
					["date", dateSortVal]
				]
			},
			limit,
			offset);

		
		const tagsData = await quotesCollection.aggregate([
			{ $match: { userId: req.session.user._id.toString() } },
			{ $unwind: "$tags" },
			{ $group: { _id: "$tags", count: { $sum: 1 } } },
			{ $sort: { count: -1, _id: 1 }}
		]).toArray();

		res.locals.username = username;
		res.locals.user = user;
		res.locals.quoteCount = quoteCount;
		res.locals.quotes = quotes;
		res.locals.tags = [];
		res.locals.tagsData = tagsData;

		res.locals.limit = limit;
		res.locals.offset = offset;
		res.locals.sort = sort;
		res.locals.paginationBaseUrl = `./${username}/quotes`;

		res.render("user-quotes");

		return;
	}

	res.render("index");
}));

router.get("/signup", asyncHandler(async (req, res, next) => {
	res.render("signup");
}));

router.post("/signup", asyncHandler(async (req, res, next) => {
	const username = req.body.username;
	const passwordHash = await passwordUtils.hash(req.body.password);

	const existingUser = await db.findOne("users", {username:username});
	if (existingUser) {
		debugLog("Username already exists");

		res.locals.userMessage = "Sorry, that username is already taken.";
		res.locals.userMessageType = "danger";

		res.render("signup");

		return;
	}

	let user = {
		username: username,
		passwordHash: passwordHash
	};

	const insertedUserId = await db.insertOne("users", user);
	user = await app.authenticate(req.body.username, req.body.password);

	req.session.username = username;
	req.session.user = user;

	req.session.userMessage = "Success!";
	req.session.userMessageType = "success";

	if (req.body.rememberme) {
		const props = {username:req.body.username, passwordHash:user.passwordHash};

		res.cookie("rememberme", JSON.stringify(props), {
			maxAge: (3 * utils.monthMillis()),
			httpOnly: appConfig.secureSite
		});

	} else {
		res.clearCookie("rememberme");
	}

	res.redirect("/");
}));

router.post("/login", asyncHandler(async (req, res, next) => {
	const user = await app.authenticate(req.body.username, req.body.password);

	if (user) {
		req.session.username = user.username;
		req.session.user = user;

		req.session.userMessage = "Success!";
		req.session.userMessageType = "success";

		if (req.body.rememberme) {
			const props = {username:req.body.username, passwordHash:user.passwordHash};

			res.cookie("rememberme", JSON.stringify(props), {
				maxAge: (3 * utils.monthMillis()),
				httpOnly: appConfig.secureSite
			});

		} else {
			res.clearCookie("rememberme");
		}

		res.redirect("/");

	} else {
		req.session.userMessage = "Login failed - Invalid username or password"
		req.session.userMessageType = "danger";

		res.redirect("/");
	}
}));

router.get("/logout", async (req, res, next) => {
	req.session.username = null;
	req.session.user = null;

	res.clearCookie("rememberme");

	res.redirect("/");
});

router.get("/settings", asyncHandler(async (req, res, next) => {
	res.render("settings");
}));

router.get("/account", asyncHandler(async (req, res, next) => {
	const quotesCollection = await db.getCollection("quotes");
	const importData = await quotesCollection.aggregate([
		{
			$match: { userId: req.session.user._id.toString() }
		},
		{
			$group: {
				_id: "$importId",
				count: { $sum: 1 },
				name: { $first: "$importName" }
			}
		},
		{
			$sort: { count: -1 }
		}
	]).toArray();

	const lists = await db.findMany("quoteLists", { userId: req.session.user._id.toString() });

	res.locals.lists = lists;
	res.locals.importData = importData;

	res.render("account");
}));

router.get("/new-quote", asyncHandler(async (req, res, next) => {
	res.render("new-quote");
}));

router.post("/new-quote", asyncHandler(async (req, res, next) => {
	const content = req.body.text;

	const quote = app.quoteFromTextRepresentation(content, req.session.user);
	const savedQuoteId = await db.insertOne("quotes", quote);

	req.session.userMessage = "Saved!";
	req.session.userMessageType = "success";

	res.redirect(`/quote/${savedQuoteId}`);
}));

router.get("/quote/:quoteId", asyncHandler(async (req, res, next) => {
	if (!req.session.user) {
		res.redirect("/");

		return;
	}

	const quoteId = req.params.quoteId;
	const quote = await db.findOne("quotes", {_id:ObjectId(quoteId)});

	if (req.session.username != quote.username) {
		res.redirect("/");

		return;
	}

	res.locals.quote = quote;

	res.render("quote");
}));

// publicly shareable link for a single quote
router.get("/share/:quoteId", asyncHandler(async (req, res, next) => {
	const quoteId = req.params.quoteId;
	const quote = await db.findOne("quotes", {_id:ObjectId(quoteId)});

	res.locals.quote = quote;

	res.locals.noTagLinks = true;
	res.locals.noUserLinks = true;
	res.locals.noSpeakerLinks = true;

	res.render("quote");
}));

router.get("/quote/:quoteId/edit", asyncHandler(async (req, res, next) => {
	const quoteId = req.params.quoteId;
	const quote = await db.findOne("quotes", {_id:ObjectId(quoteId)});

	res.locals.quote = quote;
	res.locals.quoteTextRepresentation = app.quoteToTextRepresentation(quote);

	res.render("quote-edit");
}));

router.get("/quote/:quoteId/raw", asyncHandler(async (req, res, next) => {
	const quoteId = req.params.quoteId;
	const quote = await db.findOne("quotes", {_id:ObjectId(quoteId)});

	res.locals.quote = quote;

	res.render("quote-raw");
}));

router.post("/quote/:quoteId/edit", asyncHandler(async (req, res, next) => {
	const quoteId = req.params.quoteId;
	const updatedQuote = app.quoteFromTextRepresentation(req.body.content, req.session.user);
	const existingQuote = await db.findOne("quotes", {_id:ObjectId(quoteId)});

	debugLog("updatedQuote: " + JSON.stringify(updatedQuote));

	const updatedQuoteProps = utils.objectProperties(updatedQuote);
	for (const prop in updatedQuoteProps) {
		existingQuote[prop] = updatedQuote[prop];
	}

	const quotesCollection = await db.getCollection("quotes");
	const updateResult = await quotesCollection.updateOne({_id:ObjectId(quoteId)}, {$set: updatedQuote});

	req.session.userMessage = updateResult.result.ok == 1 ? "Quote saved." : ("Status unknown: " + JSON.stringify(updateResult));
	req.session.userMessageType = "success";

	res.redirect(`/quote/${quoteId}`);
}));

router.get("/quote/:quoteId/delete", asyncHandler(async (req, res, next) => {
	const quoteId = req.params.quoteId;
	const quote = await db.findOne("quotes", {_id:ObjectId(quoteId)});

	res.locals.quote = quote;

	res.render("quote-delete");
}));

router.post("/quote/:quoteId/delete", asyncHandler(async (req, res, next) => {
	const quoteId = req.params.quoteId;
	const quote = await db.findOne("quotes", {_id:ObjectId(quoteId)});

	const result = await db.deleteOne("quotes", {_id:quote._id});

	debugLog("deleteResult: " + JSON.stringify(result));
	
	req.session.userMessage = "Quote deleted."

	res.redirect("/");
}));

router.get("/:username/quotes", asyncHandler(async (req, res, next) => {
	const username = req.params.username;

	if (!req.session.user || !req.session.username == username) {
		res.redirect("/");

		return;
	}

	var limit = 25;
	var offset = 0;
	var sort = "date-desc";

	if (req.query.limit) {
		limit = parseInt(req.query.limit);
	}

	if (req.query.offset) {
		offset = parseInt(req.query.offset);
	}

	if (req.query.sort) {
		sort = req.query.sort;
	}

	const dateSortVal = sort.startsWith("date-") ? (sort.endsWith("-desc") ? -1 : 1) : -1;

	const quotesCollection = await db.getCollection("quotes");

	const quoteCount = await quotesCollection.countDocuments({userId: req.session.user._id.toString()});

	const user = await db.findOne("users", {username: username});

	const quotes = await db.findMany(
		"quotes",
		{ userId: user._id.toString() },
		{
			sort: [
				["createdAt", dateSortVal],
				["importDate", dateSortVal],
				["importIndex", dateSortVal],
				["date", dateSortVal]
			]
		},
		limit,
		offset);

	
	const tagsData = await quotesCollection.aggregate([
		{ $match: { userId: req.session.user._id.toString() } },
		{ $unwind: "$tags" },
		{ $group: { _id: "$tags", count: { $sum: 1 } } },
		{ $sort: { count: -1, _id: 1 }}
	]).toArray();

	res.locals.username = username;
	res.locals.user = user;
	res.locals.quoteCount = quoteCount;
	res.locals.quotes = quotes;
	res.locals.tags = [];
	res.locals.tagsData = tagsData;

	res.locals.limit = limit;
	res.locals.offset = offset;
	res.locals.sort = sort;
	res.locals.paginationBaseUrl = `./${username}/quotes`;

	res.render("user-quotes");
}));

router.get("/tags/:tags", asyncHandler(async (req, res, next) => {
	const tags = req.params.tags.split(",").map(x => x.trim().toLowerCase());

	var limit = 25;
	var offset = 0;
	var sort = "date-desc";

	if (req.query.limit) {
		limit = parseInt(req.query.limit);
	}

	if (req.query.offset) {
		offset = parseInt(req.query.offset);
	}

	if (req.query.sort) {
		sort = req.query.sort;
	}

	const dateSortVal = sort.startsWith("date-") ? (sort.endsWith("-desc") ? -1 : 1) : -1;

	const quotes = await db.findMany(
		"quotes",
		{
			$and: [
				{
					$or: [
						{ userId: req.session.user._id.toString() },
						{ visibility: "public" }
					]
				},
				{ tags: { $all: tags }}
			]
		},
		{
			sort: [
				["createdAt", dateSortVal],
				["importDate", dateSortVal],
				["importIndex", dateSortVal],
				["date", dateSortVal]
			]
		},
		limit,
		offset
	);

	const quotesCollection = await db.getCollection("quotes");

	const quoteCount = await quotesCollection.countDocuments(
		{
			userId: req.session.user._id.toString(),
			tags: { $all: tags }
		}
	);

	const tagsData = await quotesCollection.aggregate([
		{ $match:
			{
				$and: [
					{
						$or: [
							{ userId: req.session.user._id.toString() },
							{ visibility: "public" }
						]
					},
					{ tags: { $all: tags }}
				]
			}
		},
		{ $unwind: "$tags" },
		{ $group: { _id: "$tags", count: { $sum: 1 } } },
		{ $sort: { count: -1, _id: 1 }}
	]).toArray();


	res.locals.tags = tags;
	res.locals.quoteCount = quoteCount;
	res.locals.quotes = quotes;
	res.locals.tagsData = tagsData;

	res.locals.limit = limit;
	res.locals.offset = offset;
	res.locals.sort = sort;
	res.locals.paginationBaseUrl = `./tags/${req.params.tags}`;

	res.render("tag-quotes");
}));

router.get("/speaker/:speaker", asyncHandler(async (req, res, next) => {
	const speaker = req.params.speaker;

	var limit = 25;
	var offset = 0;
	var sort = "date-desc";

	if (req.query.limit) {
		limit = parseInt(req.query.limit);
	}

	if (req.query.offset) {
		offset = parseInt(req.query.offset);
	}

	if (req.query.sort) {
		sort = req.query.sort;
	}

	const dateSortVal = sort.startsWith("date-") ? (sort.endsWith("-desc") ? -1 : 1) : -1;

	const quotes = await db.findMany(
		"quotes",
		{
			$and: [
				{
					$or: [
						{ userId: req.session.user._id.toString() },
						{ visibility: "public" }
					]
				},
				{ speakers: speaker }
			]
		},
		{
			sort: [
				["createdAt", dateSortVal],
				["importDate", dateSortVal],
				["importIndex", dateSortVal],
				["date", dateSortVal]
			]
		},
		limit,
		offset
	);

	const quotesCollection = await db.getCollection("quotes");

	const quoteCount = await quotesCollection.countDocuments(
		{
			userId: req.session.user._id.toString(),
			speakers: speaker
		}
	);

	const tagsData = await quotesCollection.aggregate([
		{ $match:
			{
				$and: [
					{
						$or: [
							{ userId: req.session.user._id.toString() },
							{ visibility: "public" }
						]
					},
					{ speakers: speaker }
				]
			}
		},
		{ $unwind: "$tags" },
		{ $group: { _id: "$tags", count: { $sum: 1 } } },
		{ $sort: { count: -1, _id: 1 }}
	]).toArray();

	res.locals.speaker = speaker;
	res.locals.quoteCount = quoteCount;
	res.locals.quotes = quotes;
	res.locals.tags = [];
	res.locals.tagsData = tagsData;

	res.locals.limit = limit;
	res.locals.offset = offset;
	res.locals.sort = sort;
	res.locals.paginationBaseUrl = `./speaker/${speaker}`;

	res.render("speaker-quotes");
}));

router.get("/speaker/:speaker/tags/:tags", asyncHandler(async (req, res, next) => {
	const speaker = req.params.speaker;

	var limit = 25;
	var offset = 0;
	var sort = "date-desc";

	if (req.query.limit) {
		limit = parseInt(req.query.limit);
	}

	if (req.query.offset) {
		offset = parseInt(req.query.offset);
	}

	if (req.query.sort) {
		sort = req.query.sort;
	}

	const dateSortVal = sort.startsWith("date-") ? (sort.endsWith("-desc") ? -1 : 1) : -1;

	const tags = req.params.tags.split(",").map(x => x.trim().toLowerCase());

	const quotes = await db.findMany(
		"quotes",
		{
			$and: [
				{
					$or: [
						{ userId: req.session.user._id.toString() },
						{ visibility: "public" }
					]
				},
				{ speakers: speaker },
				{ tags: { $all: tags }}
			]
		},
		{
			sort: [
				["createdAt", dateSortVal],
				["importDate", dateSortVal],
				["importIndex", dateSortVal],
				["date", dateSortVal]
			]
		},
		limit,
		offset
	);

	const quotesCollection = await db.getCollection("quotes");

	const quoteCount = await quotesCollection.countDocuments(
		{
			userId: req.session.user._id.toString(),
			speakers: speaker,
			tags: { $all: tags }
		}
	);

	const tagsData = await quotesCollection.aggregate([
		{ $match:
			{
				$and: [
					{
						$or: [
							{ userId: req.session.user._id.toString() },
							{ visibility: "public" }
						]
					},
					{ speakers: speaker },
					{ tags: { $all: tags }}
				]
			}
		},
		{ $unwind: "$tags" },
		{ $group: { _id: "$tags", count: { $sum: 1 } } },
		{ $sort: { count: -1, _id: 1 }}
	]).toArray();

	res.locals.speaker = speaker;
	res.locals.quoteCount = quoteCount;
	res.locals.quotes = quotes;
	res.locals.tags = tags;
	res.locals.tagsData = tagsData;

	res.locals.limit = limit;
	res.locals.offset = offset;
	res.locals.sort = sort;
	res.locals.paginationBaseUrl = `./speaker/${speaker}/tags/${req.params.tags}`;

	res.render("speaker-tags-quotes");
}));

router.get("/import", asyncHandler(async (req, res, next) => {
	res.render("import");
}));

router.post("/import", asyncHandler(async (req, res, next) => {
	const name = req.body.name;
	const content = req.body.content;
	const public = req.body.public ? true : false;

	const importData = await app.importQuotesFromText(name, content, public, req.session.user);

	res.redirect(`/import/${importData.importId}`);
}));

router.get("/import/:importId", asyncHandler(async (req, res, next) => {
	const importId = req.params.importId;
	const quotes = await db.findMany("quotes", {importId:importId}, {sort:[["importIndex", 1]]});
	const quotesCollection = await db.getCollection("quotes");
	const uniqueSpeakers = await quotesCollection.distinct("speakers", {importId:importId});
	
	res.locals.importId = importId;
	res.locals.uniqueSpeakers = uniqueSpeakers;
	res.locals.quotes = quotes;

	res.render("import-quotes");
}));

router.get("/import/:importId/delete", asyncHandler(async (req, res, next) => {
	const importId = req.params.importId;
	const quotes = await db.findMany("quotes", {importId:importId});
	const quotesCollection = await db.getCollection("quotes");
	const uniqueSpeakers = await quotesCollection.distinct("speakers", {importId:importId});
	
	res.locals.importId = importId;
	res.locals.uniqueSpeakers = uniqueSpeakers;
	res.locals.quotes = quotes;
	res.locals.deleteConfirm = true;

	res.render("import-quotes");
}));

router.get("/import/:importId/export", asyncHandler(async (req, res, next) => {
	const importId = req.params.importId;
	const quotes = await db.findMany("quotes", {importId:importId});

	var exportContent = "";
	quotes.forEach((quote) => {
		exportContent += app.quoteToTextRepresentation(quote);
		exportContent += "\n\n";
	});
	
	res.setHeader("content-type", "text/plain");
	res.send(exportContent);
}));

router.post("/import/:importId/delete", asyncHandler(async (req, res, next) => {
	const importId = req.params.importId;
	
	const quotesCollection = await db.getCollection("quotes");
	const deleteResult = await quotesCollection.deleteMany({importId:importId});

	req.session.userMessage = "Delete result: " + JSON.stringify(deleteResult);
	
	res.redirect("/imports");
}));

router.get("/imports", asyncHandler(async (req, res, next) => {
	const importData = await app.getImports(req.session.user);

	res.locals.importData = importData;

	res.render("imports");
}));

router.get("/search", asyncHandler(async (req, res, next) => {
	const query = req.query.query;

	var limit = 25;
	var offset = 0;
	var sort = "date-desc";

	if (req.query.limit) {
		limit = parseInt(req.query.limit);
	}

	if (req.query.offset) {
		offset = parseInt(req.query.offset);
	}

	if (req.query.sort) {
		sort = req.query.sort;
	}

	const dateSortVal = sort.startsWith("date-") ? (sort.endsWith("-desc") ? -1 : 1) : -1;

	const regex = new RegExp(query, "i");
	
	const quotes = await db.findMany(
		"quotes",
		{
			$and: [
				{
					$or: [
						{ userId: req.session.user._id.toString() },
						{ visibility: "public" }
					]
				},
				{
					$or:[
						{ text: regex },
						{ parts: regex },
						{ speakers: regex },
						{ speakerContexts: regex },
						{ tags: regex }
					]
				}
			]
		},
		{
			sort: [
				["createdAt", dateSortVal],
				["importDate", dateSortVal],
				["importIndex", dateSortVal],
				["date", dateSortVal]
			]
		},
		limit,
		offset
	);

	const quotesCollection = await db.getCollection("quotes");

	const quoteCount = await quotesCollection.countDocuments(
		{
			$and: [
				{
					$or: [
						{ userId: req.session.user._id.toString() },
						{ visibility: "public" }
					]
				},
				{
					$or:[
						{ text: regex },
						{ parts: regex },
						{ speakers: regex },
						{ speakerContexts: regex },
						{ tags: regex }
					]
				}
			]
		}
	);

	const tagsData = await quotesCollection.aggregate([
		{
			$match: {
				userId: req.session.user._id.toString(),
				$or:[
					{ text: regex },
					{ parts: regex },
					{ speakers: regex },
					{ speakerContexts: regex },
					{ tags: regex }
				]
			}
		},
		{ $unwind: "$tags" },
		{ $group: { _id: "$tags", count: { $sum: 1 } } },
		{ $sort: { count: -1, _id: 1 }}
	]).toArray();
	
	res.locals.query = query;
	res.locals.quoteCount = quoteCount;
	res.locals.quotes = quotes;
	res.locals.tags = [];
	res.locals.tagsData = tagsData;

	res.locals.limit = limit;
	res.locals.offset = offset;
	res.locals.sort = sort;
	res.locals.paginationBaseUrl = `./search?query=${query}`;

	res.render("search-quotes");
}));

router.get("/tags", asyncHandler(async (req, res, next) => {
	const quotesCollection = await db.getCollection("quotes");
	const tagsData = await quotesCollection.aggregate([
		{ $match: { userId: req.session.user._id.toString() } },
		{ $unwind: "$tags" },
		{ $group: { _id: "$tags", count: { $sum: 1 } } },
		{ $sort: { count: -1, _id: 1 }}
	]).toArray();

	res.locals.tagsData = tagsData;
	
	res.render("tags");
}));

router.get("/speakers", asyncHandler(async (req, res, next) => {
	const quotesCollection = await db.getCollection("quotes");
	const speakersData = await quotesCollection.aggregate([
		{ $match: { userId: req.session.user._id.toString() } },
		{ $unwind: "$speakers" },
		{ $group: { _id: "$speakers", count: { $sum: 1 } } },
		{ $sort: { count: -1, _id: 1 }}
	]).toArray();

	res.locals.speakersData = speakersData;
	
	res.render("speakers");
}));

router.get("/new-list", asyncHandler(async (req, res, next) => {
	res.render("new-list");
}));

router.post("/new-list", asyncHandler(async (req, res, next) => {
	const name = req.body.name;

	const tagsAnd = req.body.tagsAnd.split(",").map((item) => {
		return item.trim();

	}).filter((item) => {
		return item.trim().length > 0;
	});

	const tagsOr = req.body.tagsOr.split(",").map((item) => {
		return item.trim();

	}).filter((item) => {
		return item.trim().length > 0;
	});

	const excludedTagsOr = req.body.excludedTagsOr.split(",").map((item) => {
		return item.trim();

	}).filter((item) => {
		return item.trim().length > 0;
	});

	const speakersAnd = req.body.speakersAnd.split(",").map((item) => {
		return item.trim();

	}).filter((item) => {
		return item.trim().length > 0;
	});

	const speakersOr = req.body.speakersOr.split(",").map((item) => {
		return item.trim();

	}).filter((item) => {
		return item.trim().length > 0;
	});

	// just use this default, we will modify it later
	const excludedQuoteIds = [];

	const list = await app.createList(req.session.user, name, tagsAnd, tagsOr, excludedTagsOr, speakersAnd, speakersOr, excludedQuoteIds);

	res.redirect(`/list/${list._id.toString()}`);
}));

router.get("/list/:listId", asyncHandler(async (req, res, next) => {
	const listId = req.params.listId;
	const list = await db.findOne("quoteLists", {_id:new ObjectId(listId)});

	const queryAnds = [];
	
	// lists only include quotes from a particular user
	queryAnds.push({ userId: list.userId });

	if (list.tagsAnd.length > 0) {
		list.tagsAnd.forEach((tag) => {
			queryAnds.push({ tags: tag });
		});
	}

	if (list.tagsOr.length > 0) {
		const orTags = [];

		list.tagsOr.forEach((tag) => {
			orTags.push({ tags: tag });
		});

		queryAnds.push({ $or: orTags });
	}

	if (list.excludedTagsOr && list.excludedTagsOr.length > 0) {
		queryAnds.push({ tags: { $nin: list.excludedTagsOr } });
	}

	if (list.speakersAnd.length > 0) {
		list.speakersAnd.forEach((speaker) => {
			queryAnds.push({ speakers: speaker });
		});
	}

	if (list.speakersOr.length > 0) {
		const orSpeakers = [];

		list.speakersOr.forEach((speaker) => {
			orSpeakers.push({ speakers: speaker });
		});

		queryAnds.push({ $or: orSpeakers });
	}

	debugLog(`List: ${JSON.stringify(list)}, Query: ${JSON.stringify(queryAnds)}`);

	const quotes = await db.findMany("quotes", {
		$and: queryAnds
	});
	
	res.locals.list = list;
	res.locals.quotes = quotes;
	res.locals.noTagLinks = true;
	res.locals.noUserLinks = true;
	res.locals.noSpeakerLinks = true;

	res.render("list");
}));

router.get("/list/:listId/:quoteId", asyncHandler(async (req, res, next) => {
	const list = await db.findOne("quoteLists", {_id:ObjectId(req.params.listId)});
	const quote = await db.findOne("quotes", {_id:ObjectId(req.params.quoteId)});

	res.locals.list = list;
	res.locals.quote = quote;
	res.locals.noTagLinks = true;
	res.locals.noUserLinks = true;
	res.locals.noSpeakerLinks = true;

	res.render("quote");
}));

router.get("/changeSetting", asyncHandler(async (req, res, next) => {
	if (req.query.name) {
		if (!req.session.userSettings) {
			req.session.userSettings = {};
		}

		req.session.userSettings[req.query.name] = req.query.value;

		var userSettings = JSON.parse(req.cookies["user-settings"] || "{}");
		userSettings[req.query.name] = req.query.value;

		res.cookie("user-settings", JSON.stringify(userSettings));
	}

	res.redirect(req.headers.referer);
}));

// export all quotes for current user
router.get("/export", asyncHandler(async (req, res, next) => {
	const quotes = await db.findMany(
		"quotes",
		{
			userId:req.session.user._id.toString()
		},
		{
			sort: [
				["importDate", 1],
				["importIndex", 1],
				["date", 1]
			]
		}
	);

	var exportContent = "";
	quotes.forEach((quote) => {
		exportContent += app.quoteToTextRepresentation(quote);
		exportContent += "\n\n";
	});
	
	res.setHeader("content-type", "text/plain");
	res.send(exportContent);
}));

module.exports = router;
