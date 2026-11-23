// Handles the small demo role picker and page permissions.

const SESSION_KEY = "af_session";

// Returns the current demo user or null if no role was selected.
export function getSession() {
    // Read the saved role, or return null for a first-time visitor.
    const value = localStorage.getItem(SESSION_KEY);
    return value ? JSON.parse(value) : null;
}

// Saves the selected role in the browser.
export function startSession(role) {
    // Save only the two roles required by the PRD.
    const roleName = role === "api" ? "API team" : "Frontend developer";
    localStorage.setItem(SESSION_KEY, JSON.stringify({ role: role, userId: roleName }));
}

// Clears only the current role, not the demo data.
export function clearSession() {
    // Remove the role without touching the API demo data.
    localStorage.removeItem(SESSION_KEY);
}

// Returns a friendly label for the sidebar.
export function getRoleLabel(session) {
    // Return the name shown at the bottom of every sidebar.
    if (!session) {
        return "No role selected";
    }

    // Use the role so older saved sessions also show the short label.
    return session.role === "api" ? "API team" : "Frontend developer";
}

// Sends users to the login page or a safe page when they open a restricted URL.
export function requireRole(allowedRoles) {
    // Read the session before allowing a protected page to render.
    const session = getSession();

    // No role means the user must start at the demo login screen.
    if (!session) {
        window.location.href = "index.html";
        return null;
    }

    // A frontend developer is sent to Explorer when opening a management URL.
    if (allowedRoles && !allowedRoles.includes(session.role)) {
        window.location.href = "explorer.html";
        return null;
    }

    return session;
}
