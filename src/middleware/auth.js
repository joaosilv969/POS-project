function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login");
  }

  return next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login");
  }

  if (req.session.user.role !== "admin") {
    return res.status(403).render("error", {
      title: "Acesso negado",
      message: "Não tem permissão para aceder a esta área.",
    });
  }

  return next();
}

module.exports = {
  requireAdmin,
  requireAuth,
};
