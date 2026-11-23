// This file connects the small HTML screens to the storage and logic modules.

import {
    addHistory,
    ensureDemoData,
    getDraftSchema,
    getHistory,
    getRelations,
    getSavedQueries,
    getSources,
    getVersions,
    resetDemoData,
    saveDraftSchema,
    saveSavedQueries,
    saveSources,
    saveVersions
} from "./storage.js";
import {
    clearSession,
    getRoleLabel,
    requireRole,
    startSession
} from "./session.js";
import {
    copySchema,
    fieldTypeText,
    inferSchema,
    renameField,
    renameType,
    schemaChanges,
    schemaToSDL,
    setFieldHidden
} from "./transform.js?v=5";
import { parseQuery } from "./parser.js";
import { runQuery } from "./resolver.js?v=5";

// Starts the correct screen after the HTML has loaded.
document.addEventListener("DOMContentLoaded", async function () {
    // Load the seed data before any page tries to read it.
    await ensureDemoData();

    // Each HTML page tells this file which screen it needs to start.
    const page = document.body.dataset.page;
    addResetButtons();

    // The login page does not need a role yet.
    if (page === "login") {
        initLoginPage();
        return;
    }

    // Management pages are private to the API team role.
    const apiPages = ["sources", "endpoint", "schema", "versions"];
    const allowedRoles = apiPages.includes(page) ? ["api"] : ["api", "frontend"];
    const session = requireRole(allowedRoles);

    if (!session) {
        return;
    }

    // Show the role name and hide links the current role cannot use.
    showSession(session);
    initSidebar();

    // Start only the code needed by the current screen.
    if (page === "sources") {
        initSourcesPage();
    }
    if (page === "endpoint") {
        initEndpointPage();
    }
    if (page === "schema") {
        initSchemaPage();
    }
    if (page === "versions") {
        initVersionsPage();
    }
    if (page === "explorer") {
        initExplorerPage();
    }
    if (page === "playground") {
        initPlaygroundPage();
    }
    if (page === "saved") {
        initSavedPage();
    }
});

function initSidebar() {
    const button = document.querySelector(".sidebar-toggle");
    const sidebar = document.querySelector(".sidebar");
    const content = document.querySelector("#sidebar-content");
    button.hidden = false;

    button.addEventListener("click", function () {
        const collapsed = sidebar.classList.toggle("collapsed");
        content.inert = collapsed;
        button.setAttribute("aria-expanded", String(!collapsed));
        button.setAttribute("aria-label", collapsed ? "Expand navigation" : "Collapse navigation");
    });
}

// Shows the current role in the sidebar.
function showSession(session) {
    // Put the current demo user name in each sidebar.
    document.querySelectorAll("[data-session-name]").forEach(function (element) {
        element.textContent = getRoleLabel(session);
    });

    if (session.role === "frontend") {
        // Frontend developers can browse and run queries, not manage schemas.
        document.querySelectorAll("[data-api-only]").forEach(function (element) {
            element.hidden = true;
        });
    }
}

// Adds the same reset behavior to every screen.
function addResetButtons() {
    document.querySelectorAll("[data-reset]").forEach(function (button) {
        button.addEventListener("click", function () {
            // Reset both the saved demo data and the selected role.
            resetDemoData();
            clearSession();
            window.location.href = "index.html";
        });
    });
}

// Starts a session and sends the demo user to the right first screen.
function initLoginPage() {
    document.querySelectorAll("[data-role]").forEach(function (button) {
        button.addEventListener("click", function () {
            // Store the selected role, then open its first screen.
            startSession(button.dataset.role);
            window.location.href = button.dataset.role === "api" ? "sources.html" : "explorer.html";
        });
    });
}

// Escapes user-entered text before putting it inside an HTML string.
function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

// Shows an action result with a visual and screen-reader state.
function showMessage(element, message, state) {
    if (!element) {
        return;
    }

    element.className = "form-message " + state;
    element.textContent = message;
}

// Removes an old message when the user edits a form again.
function clearMessage(element) {
    if (!element) {
        return;
    }

    element.textContent = "";
    element.className = "form-message";
}

// Creates a simple unique id for a new local item.
function makeId(prefix) {
    return prefix + "-" + Date.now();
}

// Returns the newest published schema, or the editable draft as a fallback.
function getPublishedSchema() {
    // The newest published version is the schema frontend users should see.
    const versions = getVersions();
    return versions.length > 0 ? versions[0].schema : getDraftSchema();
}

// Converts a JSON parse error position into a useful line number.
function getJsonError(error, text) {
    const match = error.message.match(/position (\d+)/i);
    if (!match) {
        return "Invalid JSON. Check commas, quotes, and braces.";
    }

    const position = Number(match[1]);
    const line = text.slice(0, position).split("\n").length;
    return "Invalid JSON on line " + line + ".";
}

// Parses JSON and returns both the value and a friendly error message.
function parseSample(text) {
    try {
        // JSON.parse is the browser's built-in JSON validator.
        const value = JSON.parse(text);
        if (Array.isArray(value) && value.length === 0) {
            return { error: "The sample array cannot be empty." };
        }
        const rows = Array.isArray(value) ? value : [value];
        for (const row of rows) {
            if (!row || typeof row !== "object" || Array.isArray(row) || Object.keys(row).length === 0) {
                return { error: "Enter a JSON object with fields, or a list of those objects." };
            }
        }
        return { value: value };
    } catch (error) {
        return { error: getJsonError(error, text) };
    }
}

// Source registry page

// Renders every registered source as one simple card.
function renderSourceCards(sources) {
    const list = document.querySelector("#source-list");
    const empty = document.querySelector("#source-empty");
    const message = document.querySelector("#source-list-message");

    // Convert every source into one readable card.
    list.innerHTML = sources.map(function (source) {
        return `
            <article class="source-card">
                <div class="source-top">
                    <div class="source-icon">${escapeHtml(source.name.charAt(0))}</div>
                    <span class="sample">${source.mode === "live" ? "Live source" : "Mock source"}</span>
                </div>
                <h2>${escapeHtml(source.name)}</h2>
                <p class="url">${escapeHtml(source.baseUrl)}</p>
                <div class="source-info">
                    <span>${source.endpoints.length} endpoints</span>
                </div>
                <div class="source-actions">
                    <a class="button secondary-button" href="endpoint.html?source=${encodeURIComponent(source.id)}">Edit source</a>
                    <button class="text-button" type="button" data-delete-source="${escapeHtml(source.id)}">Delete</button>
                </div>
            </article>
        `;
    }).join("");

    // Show the empty message only when there are no sources.
    empty.hidden = sources.length !== 0;

    // Add a delete action to every card after the HTML is created.
    list.querySelectorAll("[data-delete-source]").forEach(function (button) {
        button.addEventListener("click", function () {
            const source = sources.find(function (item) { return item.id === button.dataset.deleteSource; });
            if (!source || !window.confirm("Delete " + source.name + "?")) {
                return;
            }
            saveSources(sources.filter(function (item) { return item.id !== source.id; }));
            initSourcesPage();
            showMessage(message, "Source deleted.", "success");
        });
    });
}

// Starts the source registry page.
function initSourcesPage() {
    // Read the source list once for this screen.
    const sources = getSources();
    renderSourceCards(sources);
}

// Endpoint editor page

// Fills the endpoint form with one endpoint when the user clicks Edit.
function fillEndpointForm(endpoint) {
    // Copy the selected endpoint into the form so it can be edited.
    document.querySelector("#endpoint-method").value = endpoint.method;
    document.querySelector("#endpoint-path").value = endpoint.path;
    document.querySelector("#endpoint-resource").value = endpoint.resource;
    document.querySelector("#endpoint-sample").value = JSON.stringify(endpoint.sample || {}, null, 2);
    document.querySelector("#endpoint-form-title").textContent = "Edit endpoint";
}

// Shows the saved endpoints for the current source.
function renderEndpointList(source) {
    const list = document.querySelector("#endpoint-list");
    const empty = document.querySelector("#endpoint-empty");
    const count = document.querySelector("#endpoint-count");

    // A new source has no endpoint list until its details are saved.
    if (!source) {
        list.innerHTML = "";
        count.textContent = "0 endpoints";
        empty.hidden = false;
        return;
    }

    // Update the count and empty message before drawing the rows.
    count.textContent = source.endpoints.length + " endpoints";
    empty.hidden = source.endpoints.length !== 0;
    // Draw one row for every saved endpoint.
    list.innerHTML = source.endpoints.map(function (endpoint) {
        return `
            <div class="endpoint-row">
                <span class="method">${escapeHtml(endpoint.method)}</span>
                <div class="endpoint-details">
                    <strong>${escapeHtml(endpoint.path)}</strong>
                    <p>${escapeHtml(endpoint.resource)} · ${endpoint.sample ? "sample ready" : "sample missing"}</p>
                </div>
                <button class="text-button" type="button" data-edit-endpoint="${escapeHtml(endpoint.id)}">Edit</button>
            </div>
        `;
    }).join("");

    // Connect each Edit button to the matching endpoint object.
    list.querySelectorAll("[data-edit-endpoint]").forEach(function (button) {
        const endpoint = source.endpoints.find(function (item) { return item.id === button.dataset.editEndpoint; });
        button.addEventListener("click", function () { fillEndpointForm(endpoint); });
    });
}

// Starts the source and endpoint editor page.
function initEndpointPage() {
    // The source id in the URL tells this page whether it is editing or adding.
    const params = new URLSearchParams(window.location.search);
    let sourceId = params.get("source");
    let sources = getSources();
    let source = sources.find(function (item) { return item.id === sourceId; }) || null;
    let editingEndpointId = null;
    const sourceForm = document.querySelector("#source-form");
    const endpointForm = document.querySelector("#endpoint-form");
    const sourceMessage = document.querySelector("#source-message");
    const endpointMessage = document.querySelector("#endpoint-message");

    sourceForm.addEventListener("input", function () { clearMessage(sourceMessage); });
    endpointForm.addEventListener("input", function () { clearMessage(endpointMessage); });

    // Fill the form when an existing source is being edited.
    if (source) {
        document.querySelector("#endpoint-title").textContent = "Edit " + source.name;
        document.querySelector("#source-name").value = source.name;
        document.querySelector("#source-url").value = source.baseUrl;
        document.querySelector("#source-mode").value = source.mode;
    }

    renderEndpointList(source);

    // Save source name, URL, and mode.
    sourceForm.addEventListener("submit", function (event) {
        event.preventDefault();
        const name = document.querySelector("#source-name").value.trim();
        const baseUrl = document.querySelector("#source-url").value.trim();
        const mode = document.querySelector("#source-mode").value;

        if (!name || !baseUrl) {
            showMessage(sourceMessage, "Enter a source name and base URL.", "error");
            return;
        }

        // URL validates the base address without another library.
        try {
            const parsedUrl = new URL(baseUrl);
            if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
                showMessage(sourceMessage, "Use an address that starts with http:// or https://.", "error");
                return;
            }
        } catch (error) {
            showMessage(sourceMessage, "Enter a complete web address starting with http:// or https://.", "error");
            return;
        }

        // Create a new source when this is the Add source screen.
        if (!source) {
            source = { id: makeId("source"), name: name, baseUrl: baseUrl, mode: mode, endpoints: [] };
            sources.push(source);
            sourceId = source.id;
            window.history.replaceState({}, "", "endpoint.html?source=" + encodeURIComponent(source.id));
        } else {
            source.name = name;
            source.baseUrl = baseUrl;
            source.mode = mode;
        }

        saveSources(sources);
        document.querySelector("#endpoint-title").textContent = "Edit " + source.name;
        showMessage(sourceMessage, "Source saved.", "success");
        renderEndpointList(source);
    });

    // Validate sample JSON without saving it.
    document.querySelector("#validate-endpoint").addEventListener("click", function () {
        const result = parseSample(document.querySelector("#endpoint-sample").value);
        showMessage(endpointMessage, result.error || "Sample JSON is valid.", result.error ? "error" : "success");
    });

    // Save a new endpoint or replace the endpoint currently being edited.
    endpointForm.addEventListener("submit", function (event) {
        event.preventDefault();
        if (!source) {
            showMessage(endpointMessage, "Save the source details before adding an endpoint.", "error");
            return;
        }

        const result = parseSample(document.querySelector("#endpoint-sample").value);
        if (result.error) {
            showMessage(endpointMessage, result.error, "error");
            return;
        }

        const endpoint = {
            id: editingEndpointId || makeId("endpoint"),
            method: document.querySelector("#endpoint-method").value,
            path: document.querySelector("#endpoint-path").value.trim(),
            resource: document.querySelector("#endpoint-resource").value.trim(),
            sample: result.value
        };

        if (!endpoint.path || !endpoint.resource) {
            showMessage(endpointMessage, "Enter an endpoint path and resource name.", "error");
            return;
        }

        // Find the old row so editing does not create a duplicate.
        const oldIndex = source.endpoints.findIndex(function (item) { return item.id === endpoint.id; });
        if (oldIndex === -1) {
            source.endpoints.push(endpoint);
        } else {
            source.endpoints[oldIndex] = endpoint;
        }

        saveSources(sources);
        editingEndpointId = null;
        endpointForm.reset();
        document.querySelector("#endpoint-form-title").textContent = "Add endpoint";
        showMessage(endpointMessage, "Endpoint saved.", "success");
        renderEndpointList(source);
    });

    // Clicking Edit changes the id used by the next Save endpoint action.
    document.querySelector("#endpoint-list").addEventListener("click", function (event) {
        const button = event.target.closest("[data-edit-endpoint]");
        if (!button) {
            return;
        }
        editingEndpointId = button.dataset.editEndpoint;
    });
}

// Schema page

// Chooses one sample for the left side of the schema preview.
function getFirstSample(sources) {
    // The first available sample is enough to give the user a preview.
    for (const source of sources) {
        for (const endpoint of source.endpoints) {
            if (endpoint.sample) {
                return endpoint.sample;
            }
        }
    }
    return {};
}

// Renders rename and hide controls for every generated field.
function renderSchemaControls(schema) {
    const controls = document.querySelector("#schema-controls");

    // Make one review block for each generated type.
    controls.innerHTML = Object.keys(schema.types).map(function (typeName) {
        const type = schema.types[typeName];
        // Make one row for each field inside the type.
        const fields = Object.keys(type.fields).map(function (fieldName) {
            const field = type.fields[fieldName];
            return `
                <div class="control-row">
                    <strong class="${field.hidden ? "hidden-field" : ""}">${escapeHtml(field.name)}</strong>
                    <span class="small-text">${escapeHtml(fieldTypeText(field))}</span>
                    <button class="text-button" type="button" data-rename-field="${escapeHtml(typeName + "::" + fieldName)}">Rename</button>
                    <button class="text-button" type="button" data-hide-field="${escapeHtml(typeName + "::" + fieldName)}">${field.hidden ? "Show" : "Hide"}</button>
                </div>
            `;
        }).join("");

        return `
            <div class="type-control">
                <div class="section-heading-row">
                    <h3>${escapeHtml(typeName)}</h3>
                    <button class="text-button" type="button" data-rename-type="${escapeHtml(typeName)}">Rename type</button>
                </div>
                ${fields}
            </div>
        `;
    }).join("");
}

// Refreshes every visible part of the schema screen.
function renderSchemaPage(schema, sources) {
    // Refresh the two code previews after every rename or hide action.
    document.querySelector("#sample-json code").textContent = JSON.stringify(getFirstSample(sources), null, 2);
    document.querySelector("#sdl-output code").textContent = schemaToSDL(schema);

    const notes = document.querySelector("#schema-notes");
    // Use a friendly note when the sample has no uncertain values.
    const noteItems = schema.notes.length > 0 ? schema.notes : ["No uncertain values were found in the sample."];
    notes.innerHTML = noteItems.map(function (note) { return "<li>" + escapeHtml(note) + "</li>"; }).join("");
    renderSchemaControls(schema);
}

// Starts the schema builder and its review controls.
function initSchemaPage() {
    // Start with the saved draft, or build one from the registered sources.
    const sources = getSources();
    const relations = getRelations();
    let schema = getDraftSchema() || inferSchema(sources, relations);
    const message = document.querySelector("#schema-message");
    saveDraftSchema(schema);
    renderSchemaPage(schema, sources);

    // Rebuild the draft so new sources and endpoints become query fields.
    document.querySelector("#generate-schema").addEventListener("click", function () {
        schema = inferSchema(getSources(), getRelations());
        saveDraftSchema(schema);
        renderSchemaPage(schema, getSources());
        showMessage(message, "Schema generated from current source samples. Review and publish it.", "success");
    });

    // One click listener handles all rename and hide buttons in the list.
    document.querySelector("#schema-controls").addEventListener("click", function (event) {
        const renameTypeButton = event.target.closest("[data-rename-type]");
        const renameFieldButton = event.target.closest("[data-rename-field]");
        const hideFieldButton = event.target.closest("[data-hide-field]");

        if (renameTypeButton) {
            // Prompt is enough for this small classroom MVP.
            const oldName = renameTypeButton.dataset.renameType;
            const newName = window.prompt("New type name:", oldName);
            if (newName && renameType(schema, oldName, newName.trim())) {
                saveDraftSchema(schema);
                renderSchemaPage(schema, sources);
                showMessage(message, "Type renamed.", "success");
            } else if (newName) {
                showMessage(message, "That type name is already used.", "error");
            }
        }

        if (renameFieldButton) {
            // Rename only the field inside the selected type.
            const parts = renameFieldButton.dataset.renameField.split("::");
            const oldName = parts[1];
            const newName = window.prompt("New field name:", oldName);
            if (newName && renameField(schema, parts[0], oldName, newName.trim())) {
                saveDraftSchema(schema);
                renderSchemaPage(schema, sources);
                showMessage(message, "Field renamed.", "success");
            } else if (newName) {
                showMessage(message, "That field name is already used.", "error");
            }
        }

        if (hideFieldButton) {
            // Hidden fields stay in the draft but disappear from published SDL.
            const parts = hideFieldButton.dataset.hideField.split("::");
            const field = schema.types[parts[0]].fields[parts[1]];
            setFieldHidden(schema, parts[0], parts[1], !field.hidden);
            saveDraftSchema(schema);
            renderSchemaPage(schema, sources);
            showMessage(message, field.hidden ? "Field hidden from the next publish." : "Field is visible again.", "success");
        }
    });

    // Save a copy so later draft edits do not change the old version.
    document.querySelector("#publish-schema").addEventListener("click", function () {
        const versions = getVersions();
        const newest = versions[0];
        const nextVersion = newest ? newest.version + 1 : 1;
        const changes = schemaChanges(newest ? newest.schema : null, schema);

        versions.push({
            version: nextVersion,
            publishedAt: new Date().toISOString(),
            schema: copySchema(schema),
            changes: changes
        });
        saveVersions(versions);
        showMessage(message, "Version " + nextVersion + " published.", "success");
    });
}

// Versions page

// Formats a saved ISO date for a small history label.
function formatDate(dateValue) {
    // Use the browser's local date format instead of a date library.
    return new Date(dateValue).toLocaleString();
}

// Shows every published schema version.
function initVersionsPage() {
    const list = document.querySelector("#version-list");
    const versions = getVersions();

    // Newest versions are already returned first by storage.js.
    list.innerHTML = versions.map(function (version, index) {
        return `
            <article class="version-card">
                <header>
                    <h2>Version ${version.version} ${index === 0 ? "· current" : ""}</h2>
                    <span class="version-date">${escapeHtml(formatDate(version.publishedAt))}</span>
                </header>
                <ul class="change-list">
                    ${version.changes.map(function (change) { return "<li>" + escapeHtml(change) + "</li>"; }).join("")}
                </ul>
            </article>
        `;
    }).join("");
}

// Explorer page

// Finds a path from a query root to a visible scalar field.
function findFieldPath(schema, typeName, targetType, targetField, visited) {
    const type = schema.types[typeName];
    if (!type || visited.includes(typeName)) {
        return "";
    }
    if (typeName === targetType) {
        return targetField;
    }
    for (const field of Object.values(type.fields)) {
        if (field.hidden) {
            continue;
        }
        const childType = field.type.replace(/[\[\]]/g, "");
        const path = findFieldPath(schema, childType, targetType, targetField, visited.concat(typeName));
        if (path) {
            return field.name + " { " + path + " }";
        }
    }
    return "";
}

function makeStarterQuery(schema, typeName, field) {
    if (schema.types[field.type.replace(/[\[\]]/g, "")]) {
        return "";
    }
    for (const root of Object.values(schema.queryFields)) {
        const path = findFieldPath(schema, root.type.replace(/[\[\]]/g, ""), typeName, field.name, []);
        if (path) {
            const argument = root.args ? "(id: 1)" : "";
            return "{ " + root.name + argument + " { " + path + " } }";
        }
    }
    return "";
}

// Renders the published types and fields that match a search.
function renderExplorer(schema, searchText) {
    const list = document.querySelector("#explorer-list");
    const empty = document.querySelector("#explorer-empty");
    const text = (searchText || "").toLowerCase();
    let visibleFieldCount = 0;

    // Draw only types that contain a field matching the search text.
    list.innerHTML = Object.keys(schema.types).map(function (typeName) {
        const type = schema.types[typeName];
        // Hide fields that the API team marked as hidden.
        const fieldNames = Object.keys(type.fields).filter(function (fieldName) {
            const field = type.fields[fieldName];
            return !field.hidden && (fieldName.toLowerCase().includes(text) || typeName.toLowerCase().includes(text));
        });

        visibleFieldCount += fieldNames.length;
        if (fieldNames.length === 0) {
            return "";
        }

        // Draw a small table row for every visible field.
        return `
            <article class="explorer-type">
                <div class="type-heading">
                    <h2>${escapeHtml(typeName)}</h2>
                    <span class="small-text">${fieldNames.length} fields</span>
                </div>
                ${fieldNames.map(function (fieldName) {
                    const field = type.fields[fieldName];
                    const starter = makeStarterQuery(schema, typeName, field);
                    return `
                        <div class="field-row">
                            <strong>${escapeHtml(field.name)}</strong>
                            <span>${escapeHtml(fieldTypeText(field))}</span>
                            <span>${escapeHtml(field.source || "Configured relation")}</span>
                            ${starter ? '<a class="text-button" href="playground.html?starter=' + encodeURIComponent(starter) + '">Try</a>' : ''}
                        </div>
                    `;
                }).join("")}
            </article>
        `;
    }).join("");

    empty.hidden = visibleFieldCount !== 0;
}

// Starts the schema explorer.
function initExplorerPage() {
    // Explorer always reads the latest published schema.
    const schema = getPublishedSchema();
    const search = document.querySelector("#field-search");
    renderExplorer(schema, "");
    // Filter the field list as the user types.
    search.addEventListener("input", function () {
        renderExplorer(schema, search.value);
    });
}

// Playground page

// Creates a copyable request template for a deployed GraphQL gateway.
function getFetchSnippet(query) {
    const queryText = JSON.stringify(query);
    return `const gatewayUrl = "https://your-gateway.example/graphql";
const query = ${queryText};

async function sendQuery() {
  try {
    const response = await fetch(gatewayUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: query })
    });

    if (!response.ok) {
      throw new Error("Request failed with status " + response.status);
    }

    const result = await response.json();
    console.log(result);
  } catch (error) {
    console.error("Could not run the query:", error.message);
  }
}

sendQuery();`;
}

// Copies text using the browser clipboard when it is available.
async function copyText(text) {
    // Use the native clipboard first, then a small older-browser fallback.
    if (navigator.clipboard) {
        try {
            await navigator.clipboard.writeText(text);
            return;
        } catch (error) {
            // Older or restricted browsers can still try the text-area method.
        }
    }

    const hiddenInput = document.createElement("textarea");
    hiddenInput.value = text;
    document.body.appendChild(hiddenInput);
    hiddenInput.select();
    let copied = false;
    try {
        copied = document.execCommand("copy");
    } finally {
        hiddenInput.remove();
    }
    if (!copied) {
        throw new Error("The browser could not copy the text.");
    }
}

// Shows whether the last query is waiting, successful, or needs attention.
function setResponseStatus(element, message, state) {
    element.textContent = message;
    element.className = "small-text response-status " + state;
}

// Keep the URL text intact and color the query punctuation, names, and values.
function formatCallPath(path) {
    const parts = path.split(/([?&=])/);
    let html = escapeHtml(parts[0]);
    for (let index = 1; index < parts.length; index += 2) {
        const separator = parts[index];
        const color = separator === "=" ? "call-value" : "call-param";
        html += '<span class="call-separator">' + escapeHtml(separator) + '</span>';
        html += '<span class="' + color + '">' + escapeHtml(parts[index + 1]) + '</span>';
    }

    return html;
}

// Shows the REST calls made by the resolver.
function renderCalls(calls) {
    const list = document.querySelector("#call-list");
    document.querySelector("#call-count").textContent = calls.length + " calls";

    // Keep the panel useful before the first query is run.
    if (calls.length === 0) {
        list.innerHTML = '<p class="empty-message">No calls yet.</p>';
        return;
    }

    // Explain every REST call returned by the resolver.
    list.innerHTML = calls.map(function (call) {
        return `
            <div class="call-row">
                <div>
                    <div class="call-request">
                        <span class="method">${escapeHtml(call.method)}</span>
                        <code>${formatCallPath(call.path)}</code>
                    </div>
                    <p class="small-text">${escapeHtml(call.source)}</p>
                </div>
                <div>
                    <span class="call-status">${escapeHtml(call.mode)}</span>
                    <p class="small-text">${call.fieldsReturned} of ${call.fieldsAvailable} fields</p>
                </div>
            </div>
        `;
    }).join("");
}

// Colors JSON tokens while keeping the original spaces and line breaks.
function renderJson(code, data) {
    const json = JSON.stringify(data, null, 2);
    const tokens = /"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?|true|false|null/gi;
    let previousEnd = 0;
    let html = "";

    for (const match of json.matchAll(tokens)) {
        const token = match[0];
        const end = match.index + token.length;
        let color = "json-literal";

        if (token.startsWith('"')) {
            color = json[end] === ":" ? "json-key" : "json-string";
        } else if (Number.isFinite(Number(token))) {
            color = "json-number";
        }

        html += escapeHtml(json.slice(previousEnd, match.index));
        html += '<span class="' + color + '">' + escapeHtml(token) + '</span>';
        previousEnd = end;
    }

    code.innerHTML = html + escapeHtml(json.slice(previousEnd));
    code.classList.add("json-output");
}

// Enter keeps the current indentation and adds two spaces after an opening brace.
function indentQueryLine(event) {
    if (event.key !== "Enter" || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
        return;
    }

    const editor = event.currentTarget;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const beforeCursor = editor.value.slice(0, start);
    const line = beforeCursor.slice(beforeCursor.lastIndexOf("\n") + 1);
    const indent = line.match(/^[ \t]*/)[0];
    const opensBlock = line.trimEnd().endsWith("{");
    const nextIndent = opensBlock ? indent + "  " : indent;
    const newLine = "\n" + nextIndent;

    event.preventDefault();
    if (opensBlock && /^[ \t]*}/.test(editor.value.slice(end))) {
        const spacesBeforeBrace = editor.value.slice(end).match(/^[ \t]*/)[0].length;
        editor.setRangeText(newLine + "\n" + indent, start, end + spacesBeforeBrace);
        editor.setSelectionRange(start + newLine.length, start + newLine.length);
    } else {
        editor.setRangeText(newLine, start, end, "end");
    }
}

// Starts the query playground and connects Run, Save, and Copy actions.
function initPlaygroundPage() {
    // The playground uses the latest published schema and local source data.
    const schema = getPublishedSchema();
    const sources = getSources();
    const relations = getRelations();
    const queryInput = document.querySelector("#query-input");
    const runButton = document.querySelector('#query-form button[type="submit"]');
    // The source editor owns Mock or Live mode, so the playground only displays it.
    const queryMode = sources[0] && sources[0].mode ? sources[0].mode : "mock";
    document.querySelector("#query-mode-label").textContent = queryMode === "live" ? "Live mode" : "Mock mode";
    const queryMessage = document.querySelector("#query-message");
    queryInput.addEventListener("input", function () { clearMessage(queryMessage); });
    queryInput.addEventListener("keydown", function (event) {
        indentQueryLine(event);
        if (event.defaultPrevented) {
            clearMessage(queryMessage);
        }
    });

    // Opening a saved query fills the editor automatically.
    const params = new URLSearchParams(window.location.search);
    const starter = params.get("starter");
    if (starter) {
        queryInput.value = starter;
    }
    const savedId = params.get("saved");
    if (savedId) {
        const savedQuery = getSavedQueries().find(function (item) { return item.id === savedId; });
        if (savedQuery) {
            queryInput.value = savedQuery.query;
        }
    }

    // Run parses the text first, then asks the resolver for data.
    document.querySelector("#query-form").addEventListener("submit", async function (event) {
        event.preventDefault();
        if (runButton.disabled) {
            return;
        }

        const query = queryInput.value.trim();
        const responseElement = document.querySelector("#query-response code");
        const responseStatus = document.querySelector("#response-status");
        const startedAt = Date.now();
        runButton.disabled = true;
        runButton.setAttribute("aria-busy", "true");
        runButton.textContent = "Running...";
        responseElement.classList.remove("json-output");
        responseElement.textContent = "Waiting for the query result...";
        renderCalls([]);
        showMessage(queryMessage, "Running query...", "info");
        setResponseStatus(responseStatus, "Running", "running");

        try {
            // Parser errors are shown to the user and do not crash the page.
            const parsed = parseQuery(query);
            const result = await runQuery(parsed, schema, sources, relations, queryMode);
            renderJson(responseElement, result.data);
            if (result.usedFallback) {
                setResponseStatus(responseStatus, "Mock fallback", "warning");
                showMessage(queryMessage, "The live request failed. The result uses mock data instead.", "info");
            } else {
                setResponseStatus(responseStatus, "Success", "success");
                showMessage(queryMessage, "Query completed successfully.", "success");
            }
            renderCalls(result.calls);
            // Save successful runs so the History screen can show them.
            addHistory({
                at: new Date().toISOString(),
                query: query,
                ok: true,
                calls: result.calls.length,
                ms: Date.now() - startedAt
            });
        } catch (error) {
            responseElement.classList.remove("json-output");
            responseElement.textContent = "No response returned.";
            setResponseStatus(responseStatus, "Error", "error");
            renderCalls([]);
            showMessage(queryMessage, error.message, "error");
            // Failed runs are also useful history, so keep them with ok=false.
            addHistory({
                at: new Date().toISOString(),
                query: query,
                ok: false,
                calls: 0,
                ms: Date.now() - startedAt
            });
        } finally {
            runButton.disabled = false;
            runButton.removeAttribute("aria-busy");
            runButton.textContent = "Run query";
        }
    });

    const saveButton = document.querySelector("#save-query");
    const saveFields = document.querySelector("#save-query-fields");
    const nameInput = document.querySelector("#query-name");

    function closeSaveFields() {
        saveFields.hidden = true;
        saveButton.setAttribute("aria-expanded", "false");
        saveButton.focus();
    }

    saveButton.addEventListener("click", function () {
        if (!saveFields.hidden) {
            closeSaveFields();
            return;
        }
        if (!queryInput.value.trim()) {
            showMessage(queryMessage, "Write a query before saving it.", "error");
            return;
        }
        clearMessage(queryMessage);
        saveFields.hidden = false;
        saveButton.setAttribute("aria-expanded", "true");
        nameInput.focus();
    });

    document.querySelector("#cancel-save-query").addEventListener("click", closeSaveFields);

    function saveQuery() {
        const query = queryInput.value.trim();
        const name = nameInput.value.trim();
        if (!query) {
            showMessage(queryMessage, "Write a query before saving it.", "error");
            queryInput.focus();
            return;
        }

        if (!name) {
            showMessage(queryMessage, "Enter a name for the saved query.", "error");
            nameInput.focus();
            return;
        }

        const saved = getSavedQueries();
        saved.unshift({ id: makeId("query"), name: name, query: query, updatedAt: new Date().toISOString() });
        saveSavedQueries(saved);
        nameInput.value = "";
        closeSaveFields();
        showMessage(queryMessage, "Query saved.", "success");
    }

    document.querySelector("#confirm-save-query").addEventListener("click", saveQuery);
    nameInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
            event.preventDefault();
            saveQuery();
        }
    });

    // Copy gives the developer a starting point for frontend code.
    document.querySelector("#copy-fetch").addEventListener("click", async function () {
        const query = queryInput.value.trim();
        if (!query) {
            showMessage(queryMessage, "Write a query before copying the example.", "error");
            return;
        }

        try {
            parseQuery(query);
        } catch (error) {
            showMessage(queryMessage, error.message, "error");
            return;
        }

        try {
            await copyText(getFetchSnippet(query));
            showMessage(queryMessage, "Gateway example copied. Replace its URL with your deployed gateway.", "success");
        } catch (error) {
            showMessage(queryMessage, "Copy failed. Select and copy the query text manually.", "error");
        }
    });
}

// Saved and history page

// Renders saved query cards with open, rename, and delete actions.
function renderSavedQueries() {
    const list = document.querySelector("#saved-list");
    const empty = document.querySelector("#saved-empty");
    const message = document.querySelector("#saved-message");
    const saved = getSavedQueries();

    // Show the empty message only when there are no saved queries.
    empty.hidden = saved.length !== 0;
    // Draw each saved query with three small actions.
    list.innerHTML = saved.map(function (item) {
        return `
            <div class="saved-item">
                <div class="saved-details">
                    <strong>${escapeHtml(item.name)}</strong>
                    <p>${escapeHtml(item.query.split("\n")[0])} · updated ${escapeHtml(formatDate(item.updatedAt))}</p>
                </div>
                <a class="text-button" href="playground.html?saved=${encodeURIComponent(item.id)}">Open</a>
                <button class="text-button" type="button" data-rename-saved="${escapeHtml(item.id)}">Rename</button>
                <button class="text-button" type="button" data-delete-saved="${escapeHtml(item.id)}">Delete</button>
            </div>
        `;
    }).join("");

    // Rename updates only the selected saved query.
    list.querySelectorAll("[data-rename-saved]").forEach(function (button) {
        button.addEventListener("click", function () {
            const savedItem = getSavedQueries().find(function (item) { return item.id === button.dataset.renameSaved; });
            if (!savedItem) {
                showMessage(message, "That saved query is no longer available.", "error");
                return;
            }
            const newName = window.prompt("New query name:", savedItem.name);
            if (!newName) {
                return;
            }
            if (!newName.trim()) {
                showMessage(message, "Enter a name for the saved query.", "error");
                return;
            }
            const allSaved = getSavedQueries();
            const item = allSaved.find(function (entry) { return entry.id === savedItem.id; });
            if (!item) {
                showMessage(message, "That saved query is no longer available.", "error");
                return;
            }
            item.name = newName.trim();
            item.updatedAt = new Date().toISOString();
            saveSavedQueries(allSaved);
            renderSavedQueries();
            showMessage(message, "Saved query renamed.", "success");
        });
    });

    // Delete removes only the selected saved query.
    list.querySelectorAll("[data-delete-saved]").forEach(function (button) {
        button.addEventListener("click", function () {
            if (!window.confirm("Delete this saved query?")) {
                return;
            }

            const allSaved = getSavedQueries().filter(function (item) { return item.id !== button.dataset.deleteSaved; });
            saveSavedQueries(allSaved);
            renderSavedQueries();
            showMessage(message, "Saved query deleted.", "success");
        });
    });
}

// Renders the last 20 query runs in a simple table.
function renderHistory() {
    const list = document.querySelector("#history-list");
    const empty = document.querySelector("#history-empty");
    const history = getHistory();
    // The storage module already limits this list to the last 20 runs.
    empty.hidden = history.length !== 0;

    // Draw one table row for each run.
    list.innerHTML = history.map(function (item) {
        return `
            <tr>
                <td>${escapeHtml(formatDate(item.at))}</td>
                <td>${escapeHtml(item.query.split("\n")[0])}</td>
                <td class="${item.ok ? "call-status" : "accent-text"}">${item.ok ? "Success" : "Error"}</td>
                <td>${item.calls}</td>
            </tr>
        `;
    }).join("");
}

// Starts the saved queries and history page.
function initSavedPage() {
    // Saved queries and history are separate lists, but both come from storage.js.
    renderSavedQueries();
    renderHistory();
}
