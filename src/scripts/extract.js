const assert = require("assert");
const fs = require("fs");

const readme = fs.readFileSync("../../README.md", "utf-8");

function slugify(name) {
	return name.toLowerCase()
		.replace(/\(.*\)/, "")
		.replace(/ - .+/, "")
		.replace(/[^a-z\d]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
}

let path = [];

let sectionData = {};

let mods = {};

const lineRegexSimple = /^- \[([^\[\]]+)\]\((https?[^\(\)]+)\)$/;
const lineRegexTag = /^- \[([^\[\]]+)\]\((https?[^\(\)]+)\) \(([^\(\)]+)\)$/;
const lineRegexTag2 = /^- \[([^\[\]]+)\]\((https?[^\(\)]+)\) \(([^\(\)]+)\) \(([^\(\)]+)\)$/;

const urlRegexCurseForge = /https?:\/\/(?:www\.)?curseforge\.com\/minecraft\/mc-mods\/([^/]+)$/;
const urlRegexModrinth = /https?:\/\/(?:www\.)?modrinth\.com\/mod\/([^/]+)$/;
const urlRegexGithub = /https?:\/\/github\.com\/[^/]+\/([^/]+)\/?$/;

function createMod(line, category) {
	let res = {
		data: {
			categories: [category],
			links: {},
			metadata: {}
		}
	};
	let url;
	let tag = null;
	let tag2 = null;

	let matches = lineRegexSimple.exec(line);
	if (matches != null) {
		res.data.name = matches[1];
		url = matches[2]; 
	} else {
		let matches = lineRegexTag.exec(line);
		if (matches != null) {
			res.data.name = matches[1];
			url = matches[2];
			tag = matches[3];
		} else {
			let matches = lineRegexTag2.exec(line);
			if (matches != null) {
				res.data.name = matches[1];
				url = matches[2];
				tag = matches[3];
				tag2 = matches[4];
			} else {
				throw "Failed to match";
			}
		}
	}

	let matchesCF = urlRegexCurseForge.exec(url);
	let matchesMR = urlRegexModrinth.exec(url);
	let matchesGH = urlRegexGithub.exec(url);
	if (matchesCF != null) {
		res.data.links.curseforge = url;
		res.slug = matchesCF[1];
	} else if (matchesMR != null) {
		res.data.links.modrinth = url;
		res.slug = matchesMR[1].replace(/_/g, "-").replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
	} else if (matchesGH != null) {
		res.data.links.github = url;
		res.slug = matchesGH[1].replace(/_/g, "-").replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
	} else if (url.startsWith("https://github.com")) {
		res.data.links.github = url;
		res.slug = slugify(res.data.name);
	} else {
		throw "Unmatched url: " + url;
	}

	for (let t of [tag, tag2]) {
		switch (t) {
			case null:
				break;
			case "outdated":
				res.data.metadata.outdated = true;
				break;
			case "untested":
				break;
			case "abandoned":
			case "archived":
			case "discontinued":
				res.data.metadata.abandoned = true;
				break;
			case "experimental":
				res.data.metadata.experimental = true;
				break;
			case "works best with client mod installed":
				res.data.metadata.recommended_client = true;
				break;
			default:
				res.data.notes = t;
		}
	}

	return res;
}

function mergeMods(origRes, newRes) {
	if (origRes.slug != newRes.slug) {
		throw `Differing slugs for same mod name: ${origRes.slug} vs ${newRes.slug}`
	}

	let mod = {
		name: origRes.data.name,
		links: origRes.data.links,
		metadata: origRes.data.metadata,
		categories: origRes.data.categories.concat(newRes.data.categories),
	};
	if (origRes.data.notes != undefined) {
		mod.notes = origRes.data.notes;
	}
	if (origRes.data.name != newRes.data.name) {
		throw `Differing names for same mod slug: ${origRes.data.name} vs ${newRes.data.name}`
	}
	for (const [key, value] of Object.entries(newRes.data.links)) {
		if (mod.links[key] == undefined) {
			mod.links[key] = value
		} else if (mod.links[key] != value) {
			throw `Inconsistent URL: ${mod.links[key]} vs ${value}`
		}
	}
	assert.deepEqual(origRes.data.metadata, newRes.data.metadata, "Inconsistent metadata");
	assert.equal(origRes.data.notes, newRes.data.notes, "Inconsistent notes");

	return mod;
}

let validCount = 0;
let invalidCount = 0;

for (line of readme.split("\n")) {
	line = line.replace("\r", "").trim();

	let count = -1;
	for (c of line) {
		if (c != '#') break;
		count++;
	}
	if (count > 0) {
		while (count <= path.length) path.pop();

		path.push(slugify(line));

		sectionData[path.join("/")] = {
			"name": line.replace(/^#+/, "").trim()
		};
	} else {
		if (line.length > 0) {
			try {
				let res = createMod(line, path.join("/"));
				if (mods[res.slug] != undefined) {
					mods[res.slug] = mergeMods({slug: res.slug, data: mods[res.slug]}, res);
					continue;
				}
				let foundSlug = Object.keys(mods).find((e) => mods[e].name == res.data.name);
				if (foundSlug != undefined) {
					throw `Inconsistent slug with ${foundSlug} (${mods[foundSlug].name})`;
				}
				mods[res.slug] = res.data;
				validCount++;
			} catch (e) {
				console.log("Line failure: " + e);
				console.log(line);
				invalidCount++;
			}
		}
	}
}

console.dir(mods, { depth: null });
console.log(validCount);
console.log(invalidCount);