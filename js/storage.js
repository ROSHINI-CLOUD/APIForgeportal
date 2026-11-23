// Keeps all browser storage code in one beginner-friendly file.

import { copySchema, inferSchema } from "./transform.js?v=5";

// These names match the localStorage keys in the PRD.
const KEYS = {
    session: "af_session",
    sources: "af_sources",
    relations: "af_relations",
    draft: "af_schema_draft",
    versions: "af_schema_versions",
    saved: "af_saved_queries",
    history: "af_history",
    seed: "af_seed_version"
};

// This is the seeded relationship required for the main demo query.
const DEFAULT_RELATIONS = [
    {
        fromType: "User",
        field: "posts",
        toType: "Post",
        toMany: true,
        method: "GET",
        path: "/posts?userId={id}"
    }
];

// These fallback samples let the demo work even when opened without a server.
const FALLBACK_USERS = [
    {
        id: 1,
        name: "Leanne Graham",
        username: "Bret",
        email: "leanne@example.com",
        address: {
            street: "Kulas Light",
            city: "Gwenborough",
            zipcode: "92998-3874",
            geo: { lat: "-37.3159", lng: "81.1496" }
        },
        phone: "1-770-736-8031",
        website: "hildegard.org",
        company: { name: "Romaguera-Crona" }
    },
    {
        id: 2,
        name: "Ervin Howell",
        username: "Antonette",
        email: "ervin@example.com",
        address: {
            street: "Victor Plains",
            city: "Wisokyburgh",
            zipcode: "90566-7771",
            geo: { lat: "-43.9509", lng: "-34.4618" }
        },
        phone: "010-692-6593",
        website: "anastasia.net",
        company: { name: "Deckow-Crist" }
    }
];

const FALLBACK_POSTS = [
    { userId: 1, id: 1, title: "A simple API guide", body: "A short post about useful APIs." },
    { userId: 1, id: 2, title: "Schema design notes", body: "A short post about clear field names." },
    { userId: 1, id: 3, title: "Working with REST data", body: "A short post about related data." },
    { userId: 2, id: 4, title: "Frontend data loading", body: "A short post about loading data." }
];

const FALLBACK_COMMENTS = [
    { postId: 1, id: 1, name: "A reader", email: "reader@example.com", body: "Easy to follow." }
];

// Creates a complete source list with samples for first-time users.
function getFallbackSources() {
    // Return a complete local source when fetch cannot read the JSON files.
    return [
        {
            id: "jsonplaceholder",
            name: "JSONPlaceholder (Users & Posts)",
            baseUrl: "https://jsonplaceholder.typicode.com",
            mode: "mock",
            endpoints: [
                { id: "users", method: "GET", path: "/users", resource: "User", sample: FALLBACK_USERS },
                { id: "user", method: "GET", path: "/users/{id}", resource: "User", sample: FALLBACK_USERS[0] },
                { id: "posts", method: "GET", path: "/posts", resource: "Post", sample: FALLBACK_POSTS },
                { id: "post", method: "GET", path: "/posts/{id}", resource: "Post", sample: FALLBACK_POSTS[0] },
                { id: "comments", method: "GET", path: "/comments", resource: "Comment", sample: FALLBACK_COMMENTS },
                { id: "comments-by-post", method: "GET", path: "/comments?postId={id}", resource: "Comment", sample: FALLBACK_COMMENTS }
            ]
        }
    ];
}

// Reads JSON seed files when a local web server is available.
async function loadSeedSources() {
    // Prefer the simple JSON files so students can edit seed data separately.
    try {
        // Load the source list and the three mock collections.
        const sourceResponse = await fetch("data/sources.json");
        const sources = await sourceResponse.json();
        const users = await fetch("data/mocks/users.json").then(function (response) { return response.json(); });
        const posts = await fetch("data/mocks/posts.json").then(function (response) { return response.json(); });
        const comments = await fetch("data/mocks/comments.json").then(function (response) { return response.json(); });
        // Match each endpoint resource to its sample collection.
        const samples = { User: users, Post: posts, Comment: comments };

        // Put the loaded samples onto each endpoint before schema generation.
        sources.forEach(function (source) {
            source.endpoints.forEach(function (endpoint) {
                endpoint.sample = samples[endpoint.resource];
                if (endpoint.path.includes("{id}")) {
                    endpoint.sample = samples[endpoint.resource][0];
                }
            });
        });

        return sources;
    } catch (error) {
        // A static file opened without a server still gets a working demo.
        return getFallbackSources();
    }
}

// Reads a value from localStorage and returns a fallback when it is missing.
function read(key, fallback) {
    // JSON.parse turns the stored string back into an object or array.
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
}

// Writes a JavaScript value to localStorage.
function write(key, value) {
    // JSON.stringify makes any plain object easy to store.
    localStorage.setItem(key, JSON.stringify(value));
}

// Seeds the demo once and creates the first published schema.
export async function ensureDemoData() {
    // Seed only once so user edits survive a page refresh.
    if (localStorage.getItem(KEYS.seed)) {
        return;
    }

    // Build the first schema from the seeded source samples.
    const sources = await loadSeedSources();
    const relations = DEFAULT_RELATIONS;
    const schema = inferSchema(sources, relations);

    // Save the complete first-run state in the browser.
    write(KEYS.sources, sources);
    write(KEYS.relations, relations);
    write(KEYS.draft, schema);
    write(KEYS.versions, [
        {
            version: 1,
            publishedAt: new Date().toISOString(),
            schema: copySchema(schema),
            changes: ["Initial schema generated from JSONPlaceholder samples."]
        }
    ]);
    write(KEYS.saved, []);
    write(KEYS.history, []);
    localStorage.setItem(KEYS.seed, "1");
}

// Returns all REST sources.
export function getSources() {
    // Return the current editable source list.
    return read(KEYS.sources, []);
}

// Saves all REST sources.
export function saveSources(sources) {
    // Replace the source list after an add or edit.
    write(KEYS.sources, sources);
}

// Returns the seeded relationships.
export function getRelations() {
    // Return the seeded relation used by the playground.
    return read(KEYS.relations, DEFAULT_RELATIONS);
}

// Returns the editable schema draft.
export function getDraftSchema() {
    // Return the API team's editable schema draft.
    return read(KEYS.draft, null);
}

// Saves the editable schema draft.
export function saveDraftSchema(schema) {
    // Save rename and hide changes before publishing.
    write(KEYS.draft, schema);
}

// Returns published versions from newest to oldest.
export function getVersions() {
    // Newest versions are easier to use when they are returned first.
    return read(KEYS.versions, []).sort(function (a, b) {
        return b.version - a.version;
    });
}

// Saves all published versions.
export function saveVersions(versions) {
    // Save the complete version list after publishing.
    write(KEYS.versions, versions);
}

// Returns saved queries.
export function getSavedQueries() {
    // Return saved query names and text.
    return read(KEYS.saved, []);
}

// Saves saved queries.
export function saveSavedQueries(queries) {
    // Save after adding, renaming, or deleting a query.
    write(KEYS.saved, queries);
}

// Returns the last 20 query runs.
export function getHistory() {
    // Return recent runs for the History table.
    return read(KEYS.history, []);
}

// Adds one run to the beginning of history.
export function addHistory(item) {
    // Put the newest run at the top and keep only the last 20.
    const history = getHistory();
    history.unshift(item);
    write(KEYS.history, history.slice(0, 20));
}

// Clears demo data so the next page load creates the seed again.
export function resetDemoData() {
    // Delete only this app's keys, not unrelated browser storage.
    Object.keys(KEYS).forEach(function (keyName) {
        localStorage.removeItem(KEYS[keyName]);
    });
}
