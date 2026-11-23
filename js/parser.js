// Parses only the small query syntax needed by the MVP playground.

// Turns query text into simple tokens such as user, (, and {.
function tokenize(query) {
    // This pattern recognizes names, numbers, quoted text, and query symbols.
    const pattern = /"[^"]*"|[A-Za-z_][A-Za-z0-9_]*|-?\d+(?:\.\d+)?|[{}():]/g;
    const tokens = [];
    let match;
    let lastIndex = 0;

    // Read one token at a time until the whole query has been checked.
    while ((match = pattern.exec(query)) !== null) {
        // Text between tokens is allowed only when it is whitespace.
        const skippedText = query.slice(lastIndex, match.index);
        if (skippedText.trim() !== "") {
            throw new Error("Unsupported character near: " + skippedText.trim());
        }
        tokens.push(match[0]);
        lastIndex = pattern.lastIndex;
    }

    if (query.slice(lastIndex).trim() !== "") {
        throw new Error("Unsupported character near: " + query.slice(lastIndex).trim());
    }

    return tokens;
}

// Reads one argument, such as id: 1.
function readArgument(tokens, state) {
    // Read the argument name, colon, and one literal value.
    const name = tokens[state.index];
    state.index += 1;

    if (tokens[state.index] !== ":") {
        throw new Error("Expected : after the argument name.");
    }

    state.index += 1;
    const rawValue = tokens[state.index];
    state.index += 1;

    if (!rawValue) {
        throw new Error("Expected a value after the argument.");
    }

    let value = rawValue;
    // Convert numbers and booleans from text into JavaScript values.
    if (/^-?\d+(\.\d+)?$/.test(rawValue)) {
        value = Number(rawValue);
    } else if (rawValue === "true" || rawValue === "false") {
        value = rawValue === "true";
    } else if (rawValue.startsWith('"')) {
        value = rawValue.slice(1, -1);
    }

    return { name: name, value: value };
}

// Reads a group of selected fields inside braces.
function readSelectionSet(tokens, state) {
    // A selection set is the part between one pair of braces.
    if (tokens[state.index] !== "{") {
        throw new Error("Expected { before the selected fields.");
    }

    state.index += 1;
    const fields = [];

    // Keep reading fields until the matching closing brace appears.
    while (state.index < tokens.length && tokens[state.index] !== "}") {
        const name = tokens[state.index];
        state.index += 1;

        if (["query", "mutation", "subscription", "fragment"].includes(name)) {
            throw new Error("Only a simple query is supported in this MVP.");
        }

        // Most fields have no arguments; the user query can have one.
        const args = {};
        if (tokens[state.index] === "(") {
            state.index += 1;
            const argument = readArgument(tokens, state);
            args[argument.name] = argument.value;

            if (tokens[state.index] !== ")") {
                throw new Error("Only one simple argument is supported.");
            }
            state.index += 1;
        }

        // A child selection means the field is an object or list of objects.
        let children = [];
        if (tokens[state.index] === "{") {
            children = readSelectionSet(tokens, state);
        }

        fields.push({ name: name, args: args, fields: children });
    }

    if (tokens[state.index] !== "}") {
        throw new Error("Missing } at the end of the selection.");
    }

    state.index += 1;
    return fields;
}

// Parses the supported query and returns a simple tree for the resolver.
export function parseQuery(query) {
    // Tokenize first so syntax errors can be shown before resolving data.
    const tokens = tokenize(query.trim());

    if (tokens.length === 0) {
        throw new Error("Write a query before running it.");
    }

    const state = { index: 0 };

    // Allow an optional query keyword and query name.
    if (tokens[state.index] === "query") {
        state.index += 1;
        if (tokens[state.index] !== "{") {
            state.index += 1;
        }
    }

    // Build the small selection tree used by resolver.js.
    const fields = readSelectionSet(tokens, state);

    if (state.index !== tokens.length) {
        throw new Error("Only one selection group is supported.");
    }

    return { fields: fields };
}
