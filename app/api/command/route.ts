// Older clients must not silently execute the previous unrestricted AI tools.
export function POST() {
  return Response.json(
    {
      error:
        "Use memory capture to save notes, profiles to make changes, and the assistant to ask questions. Automatic graph commands have been retired.",
    },
    { status: 410 },
  );
}
