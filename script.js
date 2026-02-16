const SUPABASE_URL = "https://gdxgrwbodjoxnehbfcgx.supabase.co";
const SUPABASE_KEY = "sb_publishable_ylYu3h9rHlCLt-gmz9cgdQ_LvSoL1JP";
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let state = { user: null };


// ================================
// LOGGER
// ================================
function logStatus(msg) {
    console.log(msg);
    const el = document.getElementById("auth-msg");
    if (el) el.innerText = msg;
}


// ================================
// CHECK SESSION ON PAGE LOAD
// ================================
window.addEventListener("DOMContentLoaded", async () => {
    const { data } = await db.auth.getSession();
    if (data?.session?.user) {
        state.user = data.session.user;
        await initApp();
    }
});


// ================================
// SIGN UP (UNCHANGED)
// ================================
async function handleSignUp() {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();
    const username = document.getElementById("username").value.trim();

    if (!email || !password || !username) {
        alert("Fill all fields");
        return;
    }

    const btn = document.querySelector("button[onclick='handleSignUp()']");
    btn.innerText = "Creating...";
    btn.disabled = true;

    try {
        const { data, error } = await db.auth.signUp({
            email,
            password,
            options: { data: { username } }
        });

        if (error) throw error;

        if (data.session) {
            state.user = data.user;
            await initApp();
        } else {
            logStatus("Account created! Check your email to confirm.");
            btn.innerText = "Create Account";
            btn.disabled = false;
        }

    } catch (err) {
        logStatus("SIGN UP ERROR: " + err.message);
        btn.innerText = "Create Account";
        btn.disabled = false;
    }
}


// ================================
// SIGN IN (UNCHANGED)
// ================================
async function handleSignIn() {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    if (!email || !password) {
        alert("Enter credentials");
        return;
    }

    const btn = document.querySelector("button[onclick='handleSignIn()']");
    btn.innerText = "Signing In...";
    btn.disabled = true;

    try {
        const { data, error } = await db.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        state.user = data.user;
        await initApp();

    } catch (err) {
        logStatus("LOGIN ERROR: " + err.message);
        btn.innerText = "Sign In";
        btn.disabled = false;
    }
}


// ================================
// INITIALIZE APP
// ================================
async function initApp() {
    try {
        if (!state.user) return;

        let { data: profile, error } = await db
            .from("profiles")
            .select("*")
            .eq("id", state.user.id)
            .maybeSingle();

        if (error) throw error;

        if (!profile) {
            const username =
                state.user.user_metadata?.username || "User";

            const avatar =
                `https://api.dicebear.com/9.x/glass/svg?seed=${state.user.id}`;

            const { error: insertError } = await db
                .from("profiles")
                .insert({
                    id: state.user.id,
                    username,
                    avatar_url: avatar
                });

            if (insertError) throw insertError;

            profile = { username, avatar_url: avatar };
        }

        document.getElementById("my-username").innerText =
            profile.username;

        document.getElementById("my-avatar").src =
            profile.avatar_url;

        toggleScreen("home-screen");

    } catch (err) {
        console.error(err);
        logStatus("INIT ERROR: " + err.message);
    }
}


// ================================
// SEARCH USERS
// ================================
document.getElementById("search-input").addEventListener("input", async (e) => {
    const query = e.target.value.trim();
    const resultsBox = document.getElementById("search-results");

    if (!query) {
        resultsBox.classList.add("hidden");
        resultsBox.innerHTML = "";
        return;
    }

    const { data, error } = await db
        .from("profiles")
        .select("id, username, avatar_url")
        .ilike("username", `%${query}%`)
        .neq("id", state.user.id)
        .limit(10);

    if (error) return console.error(error);

    resultsBox.innerHTML = "";
    resultsBox.classList.remove("hidden");

    data.forEach(user => {
        const div = document.createElement("div");
        div.className = "search-item";
        div.innerHTML = `
            <img src="${user.avatar_url}" class="avatar small" width="30" height="30">
            <span>${user.username}</span>
        `;
        resultsBox.appendChild(div);
    });
});


// ================================
// UPDATE PROFILE
// ================================
async function updateProfile() {
    const newName = document.getElementById("edit-name").value.trim();
    if (!newName) return alert("Enter new username");

    const { error } = await db
        .from("profiles")
        .update({ username: newName })
        .eq("id", state.user.id);

    if (error) return alert(error.message);

    document.getElementById("my-username").innerText = newName;
    document.getElementById("edit-name").value = "";
    alert("Username updated!");
}


// ================================
// DELETE ACCOUNT (SAFE VERSION)
// ================================
async function deleteAccount() {
    const confirmDelete = confirm("Are you sure? This cannot be undone.");
    if (!confirmDelete) return;

    await db.from("profiles").delete().eq("id", state.user.id);

    await db.auth.signOut();

    alert("Account deleted (profile removed).");
    window.location.reload();
}


// ================================
// GROUP MODAL
// ================================
async function openGroupModal() {
    document.getElementById("group-modal").classList.remove("hidden");

    const checklist = document.getElementById("user-checklist");
    checklist.innerHTML = "";

    const { data, error } = await db
        .from("profiles")
        .select("id, username")
        .neq("id", state.user.id);

    if (error) return console.error(error);

    data.forEach(user => {
        const div = document.createElement("div");
        div.className = "check-item";
        div.innerHTML = `
            <input type="checkbox" value="${user.id}">
            <span>${user.username}</span>
        `;
        checklist.appendChild(div);
    });
}

function closeGroupModal() {
    document.getElementById("group-modal").classList.add("hidden");
}


// ================================
// CREATE GROUP
// ================================
async function createGroup() {
    const groupName = document.getElementById("group-name").value.trim();
    if (!groupName) return alert("Enter group name");

    const selectedUsers = [
        ...document.querySelectorAll("#user-checklist input:checked")
    ].map(cb => cb.value);

    if (selectedUsers.length === 0)
        return alert("Select at least one member");

    // 1️⃣ Create group with owner
    const { data: group, error: groupError } = await db
        .from("groups")
        .insert({
            name: groupName,
            owner_id: state.user.id
        })
        .select()
        .single();

    if (groupError) return alert(groupError.message);

    // 2️⃣ Insert creator as OWNER
    await db.from("group_members").insert({
        group_id: group.id,
        user_id: state.user.id,
        role: "owner"
    });

    // 3️⃣ Insert other members
    const members = selectedUsers.map(userId => ({
        group_id: group.id,
        user_id: userId,
        role: "member"
    }));

    const { error: memberError } = await db
        .from("group_members")
        .insert(members);

    if (memberError) return alert(memberError.message);

    alert("Group created!");
    closeGroupModal();
}



// ================================
// SCREEN TOGGLER
// ================================
function toggleScreen(screenId) {
    ["auth-screen", "home-screen", "chat-screen", "settings-screen"]
        .forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.classList.add("hidden");
            el.classList.remove("active-screen");
        });

    const target = document.getElementById(screenId);
    if (target) {
        target.classList.remove("hidden");
        target.classList.add("active-screen");
    }
}


// ================================
// LOGOUT
// ================================
async function handleLogout() {
    await db.auth.signOut();
    window.location.reload();
}


// ================================
// PLACEHOLDERS
// ================================
function loadChats() {}
function openChat() {}
function closeChat() {}
function sendMessage() {}
function handleFileSelect() {}
function cancelFile() {}
