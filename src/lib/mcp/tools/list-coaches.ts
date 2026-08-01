import { defineTool } from "@lovable.dev/mcp-js";
import { COACHES } from "@/lib/coaches";

export default defineTool({
  name: "list_coaches",
  title: "List coaches",
  description: "List the available RizzGod coaches (id, name, tagline, description).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => {
    const coaches = COACHES.map((c) => ({
      id: c.id,
      name: c.name,
      tagline: c.tagline,
      description: c.desc,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(coaches) }],
      structuredContent: { coaches },
    };
  },
});
