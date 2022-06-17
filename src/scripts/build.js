const fs = require("fs").promises;
const stream = require("stream").promises;
const TOML = require("@ltd/j-toml");
const { createWriteStream } = require("fs");
const { Readable } = require("stream");
const { html, render } = require("ucontent");

async function* getMods() {
	for (const ent of await fs.readdir("src/mods", { withFileTypes: true })) {
		if (ent.isDirectory()) continue;
		yield [ent.name.replace(/\.toml$/, ""), TOML.parse(await fs.readFile(`src/mods/${ent.name}`))]
	}
}

async function* getCategories() {
	const parentCategoriesSeen = [];
	async function* getChildCategories(parent) {
		for (const ent of await fs.readdir(`src/categories/${parent}`, { withFileTypes: true })) {
			const slug = parent + "/" + ent.name.replace(/\.toml$/, "");
			if (ent.isDirectory()) {
				// Ensure category index toml is emitted before directory
				yield [slug, TOML.parse(await fs.readFile(`src/categories/${slug}.toml`))];
				parentCategoriesSeen.push(slug);

				yield* getChildCategories(slug);
			} else if (!parentCategoriesSeen.includes(slug)) {
				yield [slug, TOML.parse(await fs.readFile(`src/categories/${slug}.toml`))];
			}
		}
	}
	for (const ent of await fs.readdir(`src/categories`, { withFileTypes: true })) {
		const slug = ent.name.replace(/\.toml$/, "");
		if (ent.isDirectory()) {
			// Ensure category index toml is emitted before directory
			yield [slug, TOML.parse(await fs.readFile(`src/categories/${slug}.toml`))];
			parentCategoriesSeen.push(slug);

			yield* getChildCategories(slug);
		} else if (!parentCategoriesSeen.includes(slug)) {
			yield [slug, TOML.parse(await fs.readFile(`src/categories/${slug}.toml`))];
		}
	}
}

function compareBool(a, b) {
	if (a == b) {
		return 0;
	} else if (a) {
		return 1;
	} else {
		return -1;
	}
}

async function collect(iter) {
	const res = [];
	for await (const item of iter) {
		res.push(item);
	}
	return res;
}

async function* generateModsTable(modsList, mods) {
	yield html`
<table>
${modsList.map(mod => {
			let tags = [];
			if (mod.notes !== undefined) {
				tags.push(mod.notes);
			}
			if (mod.metadata !== undefined && mod.metadata.outdated) {
				tags.push("outdated");
			}
			if (mod.metadata !== undefined && mod.metadata.recommended_client) {
				tags.push("works best with client mod installed");
			}
			if (mod.metadata !== undefined && mod.metadata.experimental) {
				tags.push("experimental");
			}
			if (mod.metadata !== undefined && mod.metadata.abandoned) {
				tags.push("abandoned");
			}
			if (mod.upstream !== undefined) {
				tags.push("fork of " + mods[mod.upstream].name)
			}

			let links = [];
			if (mod.links.modrinth !== undefined) {
				links.push(html`<a href=${mod.links.modrinth}>Modrinth</a>`);
				links.push(" ");
			}
			if (mod.links.curseforge !== undefined) {
				links.push(html`<a href=${mod.links.curseforge}>CurseForge</a>`);
				links.push(" ");
			}
			if (mod.links.github !== undefined) {
				links.push(html`<a href=${mod.links.github}>Github</a>`);
				links.push(" ");
			}
			if (mod.links.website !== undefined) {
				links.push(html`<a href=${mod.links.website}>Website</a>`);
				links.push(" ");
			}

			return html`<tr>
	<td>${mod.name}</td>
	<td>${links.slice(0, -1)}</td>
	<td>${tags.join(", ")}</td>
</tr>
`
		})}
</table>`;
}

async function* generateModsTables(modsList, mods) {
	for await (const [slug, category] of getCategories()) {
		switch ((slug.match(/\//g)||[]).length) {
			case 0:
				yield html`<h2>${category.name}</h2>`
				break;
			case 1:
				yield html`<h3>${category.name}</h3>`
				break;
			default:
				yield html`<h4>${category.name}</h4>`
				break;
		}
		if (category.notes !== undefined) {
			yield html`<p>${category.notes}</p>`;
		}

		let categoryMods = modsList.filter(mod => mod.categories.includes(slug));
		if (categoryMods.length > 0) {
			yield* generateModsTable(categoryMods, mods);
		}
	}
}

async function generateReadme(page) {
	const mods = {};
	let modsList = [];
	for await (const [slug, mod] of getMods()) {
		mods[slug] = mod;
		modsList.push(mod);
	}

	// TODO: sort by some measure of popularity

	modsList.sort((a, b) => {
		// Abandoned mods last, then outdated, then experimental
		let cmp = compareBool(a.metadata?.abandoned ?? false, b.metadata?.abandoned ?? false);
		if (cmp == 0) {
			cmp = compareBool(a.metadata?.outdated ?? false, b.metadata?.outdated ?? false);
			if (cmp == 0) {
				cmp = compareBool(a.metadata?.experimental ?? false, b.metadata?.experimental ?? false);
			}
		}
		return cmp;
	});

	for (const [i, filterList] of Object.values(filters).entries()) {
		modsList = modsList.filter(filterList[page[i]][1]);
	}

	return html`
<h1>Quilt Server-side Mods</h1>
<p>This is a list of server-side mods for the Quilt modloader; including many Fabric mods (which are compatible with Quilt) and some Quilt-only mods. Wondering what Quilt is? It&#39;s a new modloader, compatible with the vast majority of Fabric mods; see <a href="https://quiltmc.org/about/faq/">the FAQ page here</a>!
Feel free to submit a Pull Request if you find a server side Quilt/Fabric mod not listed here.</p>
<p>Also see <a href="https://lambdaurora.dev/optifine_alternatives/">Optifine Alternatives</a> for a few useful client side only mods!</p>
<p>Mods on this list are marked as outdated when they are <em>two</em> major Minecraft versions old - e.g. if 1.16 is the latest version, 1.14 and older mods are considered outdated.</p>

<p>${modsList.length} mods in this list!${await collect(filterLinks(page))}</p>

<hr>

${await collect(generateModsTables(modsList, mods))}
	`;
}

let filters = {
	"Available from:": {
		"any": ["Any", mod => true],
		"modrinth": ["Modrinth", mod => mod.links.modrinth !== undefined],
		"curseforge": ["CurseForge", mod => mod.links.curseforge !== undefined],
	},
	"Status:": {
		"any": ["Any", mod => true],
		"updated": ["Up to date", mod => mod.metadata === undefined || mod.metadata.outdated === undefined],
		"outdated": ["Outdated", mod => mod.metadata !== undefined && mod.metadata.outdated],
	}
};

async function* filterLinks(page) {
	let filterTypes = Object.keys(filters);
	for (const [i, type] of filterTypes.entries()) {
		yield " ";
		yield type;
		for (const [slug, [name, filter]] of Object.entries(filters[type])) {
			yield " ";
			if (page[i] == slug) {
				yield name;
			} else {
				let newPage = page.slice();
				newPage[i] = slug;
				let link = `/${newPage.join("/")}/`;
				if (newPage.every(s => s == "any")) {
					link = "/";
				}
				yield html`<a href=${link}>${name}</a>`;
			}
		}
	}
}

async function createPage(page) {
	let pathPage = page;
	if (page.every(s => s == "any")) {
		pathPage = [];
	}
	await fs.mkdir(["dist", ...pathPage].join("/"), { recursive: true });
	const readmeStream = createWriteStream(["dist", ...pathPage, "index.html"].join("/"));
	// TODO: asyncify?
	render(readmeStream, await generateReadme(page)).end();
}

async function createPages(page, i) {
	const filterLists = Object.values(filters);
	if (i >= filterLists.length) {
		await createPage(page);
	} else {
		for (const slug of Object.keys(filterLists[i])) {
			let newPage = page.slice();
			newPage.push(slug);
			createPages(newPage, i + 1);
		}
	}
}

(async () => {
	await createPages([], 0);
})();