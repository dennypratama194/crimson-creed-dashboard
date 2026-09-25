# Deploy another brand

The two brands share this repository and receive updates from the same `main`
branch. They must have **separate Vercel projects and separate Supabase projects**.
Never replace Crimson's existing Supabase variables to launch the second brand.

1. **30s Fams is already configured.** Set `NEXT_PUBLIC_BRAND_ID=30s-fams`;
   its name and red palette are built in. The logo, mark and icon can be added
   later through the corresponding environment variables. Other deployments can
   choose a lowercase slug, display name, colors, and logo URLs.
   The logo, mark and icon accept public HTTPS image URLs or files in `public/`.
   Without artwork, the interface displays the brand name as text. Light and
   dark accent colors should contrast with white and near-black text respectively.
2. Create a new Supabase project. Apply this repo's migrations in their existing
   order. Migrations contain the same rank and business rules for both brands.
   The historical `organization_settings` seed row says Crimson Creed: update
   that row to the new name in the **new database only**. Never run `db:seed`
   against a production project. Create its first admin using `create-admin.ts`
   with `NEXT_PUBLIC_BRAND_ID` and `MEMBER_EMAIL_DOMAIN` set to the same values
   the new Vercel deployment will use.
3. Import this same GitHub repository into a **new** Vercel project. Copy the
   project build settings, but enter the new project's own environment values:

   ```bash
   NEXT_PUBLIC_BRAND_ID=30s-fams
   MEMBER_EMAIL_DOMAIN=30s-fams.local
   # Add the logo when ready:
   NEXT_PUBLIC_BRAND_LOGO_URL=https://example.com/logo.png
   NEXT_PUBLIC_BRAND_MARK_URL=https://example.com/mark.png
   NEXT_PUBLIC_BRAND_ICON_URL=https://example.com/icon.png
   NEXT_PUBLIC_SUPABASE_URL=https://new-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<new-project-anon-key>
   SUPABASE_SERVICE_ROLE_KEY=<new-project-service-key>
   NEXT_PUBLIC_APP_URL=https://other-gang.example.com
   FIVEM_SERVER_URL=https://other-game-server.example.com:30120
   FIVEM_PUBLIC_HOST=other-game-server.example.com:30120
   FIVEM_JOIN_CODE=<other-server-join-code>
   ```

   The logo and color values are optional. The ID and name are required for a
   non-Crimson deployment. FiveM without a configured endpoint is shown as
   unconfigured, never pointed to Crimson's server.

4. Set the new Supabase Auth Site URL / redirect allowlist for the new domain,
   then deploy the new Vercel project and check sign-in, admin access, brand
   artwork, and FiveM. Keep preview deployments away from production data.

The member email domain is an internal Supabase Auth identifier. Changing it
after creating users prevents those usernames from signing in. The database
rank enum (`BOSS`, `UNDER_BOSS`, etc.), permissions, and workflows are shared;
a different hierarchy needs a separate product change and migration.

The current Crimson Vercel project needs no new variables. Deploying this code
there retains its old appearance, auth domain, and FiveM defaults.
