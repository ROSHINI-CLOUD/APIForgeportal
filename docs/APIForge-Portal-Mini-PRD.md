# APIForge Portal — Ultra Mini PRD

## 1. Product summary

APIForge Portal is a small browser application that makes several REST APIs look like one simple
GraphQL-style API.

An API team adds REST sources, endpoints, and sample JSON. APIForge reads the samples and creates a
schema. The team can review, rename, hide, and publish that schema.

A frontend developer can then search the published schema and run one query instead of manually
calling several REST endpoints.

### Product promise

Get a user's name, city, and post titles with one query, without reading two REST documents.

### Project facts

| Item | Details |
| --- | --- |
| Product ID | `PST_PD_175` |
| Project length | 4 weeks |
| Team | 2 students |
| Platform | Responsive web app, laptop first, usable at 375px |
| Backend | None |
| Storage | Browser `localStorage` |
| Live API | JSONPlaceholder |

## 2. Users and problem

### API team lead

Registers REST APIs, checks the generated schema, and publishes versions with visible changes.

### Frontend developer

Searches the published schema, runs a query, sees the REST calls, saves useful queries, and copies a
fetch example.

### Problem solved

Without APIForge, a developer must read multiple API documents, make multiple calls, find nested
values, connect related data, and remove fields they do not need.

APIForge combines these steps in the browser and returns only the fields requested by the query.

## 3. MVP screens

The MVP includes these screens only:

1. **Demo Login** — Choose API team or Frontend developer. Reset demo data.
2. **Sources** — Add, edit, and delete REST sources.
3. **Endpoint Editor** — Enter GET method, path, resource name, and sample JSON. Validate JSON.
4. **Schema** — View sample JSON, generated schema, inference notes, rename fields/types, hide fields,
   and publish.
5. **Versions** — View published versions and their change lists.
6. **Explorer** — Search fields, view types, and see the source endpoint.
7. **Playground** — Write a supported query, run it, view the response and REST calls, save it, and
   copy a fetch snippet.
8. **Saved Queries & History** — Open, rename, and delete saved queries. View the last 20 runs.

The `User.posts` relation is seeded in the data. A separate relation editor is not part of the MVP.

## 4. Main example

```graphql
{
  user(id: 1) {
    name
    address { city }
    posts { title }
  }
}
```

In Mock mode, APIForge should make these two calls:

```text
GET /users/1
GET /posts?userId=1
```

The response should contain the user's name, `address.city`, and post titles only. The Calls panel
shows the method, path, status, timing, and requested fields compared with available fields.

## 5. Core product behavior

### Source data

Each source has a name, unique ID, `https://` base URL, and `mock` or `live` mode. Each endpoint
has a GET method, path, resource name, one sample JSON response, and mock data when needed.

Seed data:

```text
data/sources.json
data/mocks/users.json
data/mocks/posts.json
data/mocks/comments.json
```

### Schema generation

The transformer creates object types, scalar fields, nested objects, lists, required markers, query
fields, and notes for uncertain values.

Basic rules:

- `id` or a key ending in `Id` → `ID`
- Whole number → `Int`
- Decimal number → `Float`
- Boolean → `Boolean`
- Text → `String`
- Object → a PascalCase type, such as `address` → `Address`
- Object array → a list type, such as `[Post]`
- `null` or an empty array → show a type-check note
- Present non-null values → add the required marker `!`

### Versions

Publishing creates versions such as `v1` and `v2`. The change list records added, removed, renamed,
or changed types and fields. Frontend developers can see only the latest published version.

### Playground

The parser supports only:

- Optional query names.
- Top-level endpoint fields.
- One literal argument, such as `id: 1`.
- Nested selections.
- Seeded relations.

It does not support mutations, subscriptions, fragments, directives, variables, aliases, or the
full GraphQL language. Invalid syntax, unknown fields, 404 responses, network errors, and more than
10 REST calls must show clear messages without crashing the page.

## 6. Technology and code structure

| Layer | Technology | Purpose |
| --- | --- | --- |
| Pages | HTML5 | Eight simple screens |
| Styling | CSS3 | Dark, rounded, responsive beginner UI |
| Logic | Vanilla JavaScript | Forms, validation, schema generation, parsing, fetch, resolver |
| Storage | `localStorage` | Demo session, sources, schemas, versions, saved queries, history |
| Seed data | JSON files | Reliable Mock mode |
| Live data | JSONPlaceholder | Public GET requests |
| Hosting | GitHub Pages or Vercel | Static deployment |

Simple file layout:

```text
index.html, sources.html, endpoint.html, schema.html
versions.html, explorer.html, playground.html, saved.html
index.css
js/storage.js     - browser data
js/session.js     - demo roles and page guards
js/transform.js   - JSON to schema
js/parser.js      - small query parser
js/resolver.js    - query to REST calls
js/app.js         - page events and display
data/             - seed sources and mock JSON
```

The transformer and resolver should stay separate from DOM code. The project does not need React,
Vite, a backend, a database, authentication, API keys, or extra libraries.

## 7. Roles, storage, and responsive behavior

API team members can manage sources, endpoints, schemas, versions, and publishing. Frontend
developers can explore, query, save, and view history, but cannot manage or publish.

The app stores data only in the current browser using these keys:

```text
af_session
af_sources
af_relations
af_schema_draft
af_schema_versions
af_saved_queries
af_history
af_seed_version
```

Reset demo data restores the original seed. There are no real accounts and no cross-device sync.

The layout must work on laptops and 375px phones. Panels stack on small screens, code areas stay
readable, tables can scroll or become cards, and forms keep visible labels and keyboard focus.

## 8. Out of scope

Not required for the MVP:

- CSV export.
- Printable schema PDF or downloadable `schema.graphql`.
- Source/status or field-type filters.
- Relation editor.
- Charts.
- React/Vite rewrite.
- Query variables or aliases.
- Node/Express server.
- Mutations, subscriptions, fragments, or directives.
- Full GraphQL parser.
- Server-side proxy, authentication, API keys, rate limiting, or OpenAPI import.
- Real accounts or cross-device synchronization.

## 9. Acceptance checklist

The MVP is complete when:

- Both demo roles work and restricted URLs are protected.
- Sources and endpoints can be saved and validated.
- Sample JSON creates a readable schema with notes.
- Types and fields can be renamed or hidden.
- Publishing creates versions and change lists.
- Explorer search shows field types and REST sources.
- The example query returns the name, city, and three post titles using exactly two calls.
- Unknown fields and invalid queries show clear errors.
- Mock mode works offline and Live mode can call JSONPlaceholder.
- Saved queries and the last 20 history items survive refresh.
- The interface is usable on a 375px phone.

## 10. Delivery

| Week | Main work |
| --- | --- |
| 1 | HTML/CSS screens, seed JSON, Git, REST and GraphQL basics |
| 2 | Forms, validation, localStorage, transformer, Schema, Explorer |
| 3 | Parser, resolver, relations, errors, versions, history, role guards |
| 4 | Accessibility, responsive testing, README, deployment, final demo |

Final deliverables are the Git repository, deployed demo, README with examples, seed/mock JSON,
wireframes, usability notes from three testers, and a 3–5 minute demo or live presentation.
