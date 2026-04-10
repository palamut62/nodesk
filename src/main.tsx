import React from "react";
import ReactDOM from "react-dom/client";
import Widget from "./Widget";
import Editor from "./Editor";
import "./styles/apple.css";

function Router() {
  const hash = window.location.hash.replace(/^#/, "");
  if (hash.startsWith("/editor")) return <Editor />;
  return <Widget />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Router />
  </React.StrictMode>,
);
