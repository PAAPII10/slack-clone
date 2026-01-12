import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  isAuthenticatedNextjs,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

const isPublicRoute = createRouteMatcher(["/auth"]);

export default convexAuthNextjsMiddleware(async (request) => {
  if (!isPublicRoute(request) && !(await isAuthenticatedNextjs())) {
    return nextjsMiddlewareRedirect(request, "/auth");
  }

  if (isPublicRoute(request) && (await isAuthenticatedNextjs())) {
    return nextjsMiddlewareRedirect(request, "/");
  }

  // TODO: Redirect user away from 'auth' page if they are already authenticated
});

export const config = {
  // The following matcher runs middleware on all routes
  // except static assets.
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
