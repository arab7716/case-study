import React from "react";
import "./App.css";
import ChatWindow from "./components/ChatWindow";

function App() {
  return (
    <div className="App">
      <div className="heading">
        <span>PartSelect</span>&nbsp;AI Assistant
      </div>
      <div className="chat-container">
        <ChatWindow />
      </div>
    </div>
  );
}

export default App;