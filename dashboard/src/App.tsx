import { Route, Router, Switch } from "wouter";
import { Layout } from "@/components/layout";
import { getAdminToken } from "@/lib/auth";
import { LoginPage } from "@/pages/login";
import { KeysPage } from "@/pages/keys";
import { UsagePage } from "@/pages/usage";
import { NotFoundPage } from "@/pages/not-found";

/**
 * Top-level routing.
 *
 * The dashboard is served under `/dashboard/` (see vite `base` + Express
 * static mount), so we tell wouter to use that as its base.  Inside the
 * router we use paths relative to the base — e.g. `to="/keys"` resolves
 * to `/dashboard/keys` in the address bar.
 *
 * If there is no admin token in sessionStorage we render the login page
 * for every route — no half-loaded layout, no flash of empty tables.
 */
export default function App() {
  const hasToken = getAdminToken() !== null;

  if (!hasToken) {
    return (
      <Router base="/dashboard">
        <LoginPage />
      </Router>
    );
  }

  return (
    <Router base="/dashboard">
      <Layout>
        <Switch>
          <Route path="/" component={KeysPage} />
          <Route path="/keys" component={KeysPage} />
          <Route path="/usage" component={UsagePage} />
          <Route component={NotFoundPage} />
        </Switch>
      </Layout>
    </Router>
  );
}
