const fs = require("fs").promises;
const stream = require("stream").promises;
const TOML = require("@ltd/j-toml");
const { createWriteStream } = require("fs");
const { Readable } = require("stream");

async function* getMods() {
	for (const ent of await fs.readdir("../mods", { withFileTypes: true })) {
		if (ent.isDirectory()) continue;
		yield [ent.name.replace(/\.toml$/, ""), TOML.parse(await fs.readFile(`../mods/${ent.name}`))]
	}
}

async function* getCategories() {
	const parentCategoriesSeen = [];
	async function* getChildCategories(parent) {
		for (const ent of await fs.readdir(`../categories/${parent}`, { withFileTypes: true })) {
			const slug = parent + "/" + ent.name.replace(/\.toml$/, "");
			if (ent.isDirectory()) {
				// Ensure category index toml is emitted before directory
				yield [slug, TOML.parse(await fs.readFile(`../categories/${slug}.toml`))];
				parentCategoriesSeen.push(slug);

				yield* getChildCategories(slug);
			} else if (!parentCategoriesSeen.includes(slug)) {
				yield [slug, TOML.parse(await fs.readFile(`../categories/${slug}.toml`))];
			}
		}
	}
	for (const ent of await fs.readdir(`../categories`, { withFileTypes: true })) {
		const slug = ent.name.replace(/\.toml$/, "");
		if (ent.isDirectory()) {
			// Ensure category index toml is emitted before directory
			yield [slug, TOML.parse(await fs.readFile(`../categories/${slug}.toml`))];
			parentCategoriesSeen.push(slug);

			yield* getChildCategories(slug);
		} else if (!parentCategoriesSeen.includes(slug)) {
			yield [slug, TOML.parse(await fs.readFile(`../categories/${slug}.toml`))];
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

async function* generateReadme() {
	const mods = {};
	const modsList = [];
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

	yield `# Quilt Server-side Mods

This is a list of server-side mods for the Quilt modloader; including many Fabric mods (which are compatible with Quilt) and some Quilt-only mods. Wondering what Quilt is? It's a new modloader, compatible with the vast majority of Fabric mods; see [the FAQ page here](https://quiltmc.org/about/faq/)!
Feel free to submit a Pull Request if you find a server side Quilt/Fabric mod not listed here.

Also see [Optifine Alternatives](https://lambdaurora.dev/optifine_alternatives/) for a few useful client side only mods!

Mods on this list are marked as outdated when they are *two* major Minecraft versions old - e.g. if 1.16 is the latest version, 1.14 and older mods are considered outdated.
`;

	for await (const [slug, category] of getCategories()) {
		yield "#".repeat((slug.match(/\//g)||[]).length + 2) + " " + category.name;
		if (category.notes !== undefined) {
			yield category.notes;
			yield "";
		}

		for (const mod of modsList) {
			if (mod.categories.includes(slug)) {
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

				let tagsStr = tags.map(t => ` (${t})`).join("");

				if (mod.links.modrinth !== undefined) {
					yield `- [${mod.name}](${mod.links.modrinth})${tagsStr}`;
				} else if (mod.links.curseforge !== undefined) {
					yield `- [${mod.name}](${mod.links.curseforge})${tagsStr}`;
				} else if (mod.links.github !== undefined) {
					yield `- [${mod.name}](${mod.links.github})${tagsStr}`;
				} else {
					yield `- ${mod.name}${tagsStr}`;
				}
				
			}
		}

		yield "";
	}
}

(async () => {
	const readmeStream = createWriteStream("../../README.md");
	stream.pipeline(generateReadme(), src => Readable.from(src).map(line => line + "\n"), readmeStream);
})();