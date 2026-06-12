const baseUrl = process.env.STORYFLOW_BASE_URL || "http://127.0.0.1:3000";
const token = process.env.STORYFLOW_ACCESS_TOKEN || "";
const projectId = process.env.STORYFLOW_PROJECT_ID || "";

const routes = [
  ["/api/story-bible", "GET"],
  ["/api/project-steps", "GET"],
  ["/api/structure/characters", "GET"],
  ["/api/structure/episodes", "GET"],
  ["/api/versions", "GET"],
  ["/api/localization-diffs", "GET"],
  ["/api/drama-scores", "GET"],
];

async function main() {
  console.log(`StoryFlow Phase 2 API smoke: ${baseUrl}`);

  if (!token) {
    const response = await fetch(`${baseUrl}/api/story-bible?projectId=smoke`);
    console.log(`unauthenticated /api/story-bible -> ${response.status}`);
    if (response.status !== 401) throw new Error("Expected 401 for unauthenticated request.");
    console.log("OK: auth guard works.");
    return;
  }

  if (!projectId) throw new Error("Set STORYFLOW_PROJECT_ID when STORYFLOW_ACCESS_TOKEN is provided.");

  for (const [route, method] of routes) {
    const separator = route.includes("?") ? "&" : "?";
    const url = `${baseUrl}${route}${separator}projectId=${encodeURIComponent(projectId)}`;
    const response = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await response.text();
    console.log(`${method} ${route} -> ${response.status}`);
    if (!response.ok) console.log(text.slice(0, 300));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
