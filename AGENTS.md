<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Interface architecture
- Keep the unified presentation layer in `src/styles.css` and shared UI primitives; retain existing structural hooks so visual updates cannot alter game operations.
- Route-specific visual changes must preserve handlers, queries, validation, permissions and mutation payloads; the redesign is presentation-only.
