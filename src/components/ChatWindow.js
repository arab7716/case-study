import React, { useState, useEffect, useRef } from "react";
import "./ChatWindow.css";
import { marked } from "marked";
import ProductCard from "./ProductCard";

function ChatWindow() {
  const defaultMessage =[{
    role: "assistant",
    content: "Hi there! I'm the PartSelect AI Assistant. I can help you find parts and troubleshoot issues for your Refrigerator or Dishwasher. How can I help you today?"
  }];

  const [messages, setMessages] = useState(defaultMessage);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false); 

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
      scrollToBottom();
  }, [messages]);

  const handleSend = async (currentInput) => {
    if (currentInput.trim() !== "") {
      const userMessage = { role: "user", content: currentInput };
      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);
      setInput("");
      setIsLoading(true);

      try {
        const response = await fetch("http://localhost:3001/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            message: currentInput, 
            history: messages 
          }),
        });

        const data = await response.json();
        setMessages([...updatedMessages, { role: "assistant", content: data.reply }]);
      } catch (error) {
        console.error("Backend Error:", error);
        setMessages([...updatedMessages, { role: "assistant", content: "Sorry, I am having trouble connecting to the server." }]);
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Helper function to parse Generative UI tokens out of the text
  const renderMessageContent = (content) => {
    // Regex to find[PRODUCT_CARD: PartNumber | Price | Name | URL]
    const cardRegex = /\[PRODUCT_CARD:\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^\]]+)\]/g;
    let match;
    let cards =[];
    let cleanText = content;

    // Extract all product cards from the string
    while ((match = cardRegex.exec(content)) !== null) {
      cards.push({
        partNumber: match[1].trim(),
        price: match[2].trim(),
        name: match[3].trim(),
        productUrl: match[4].trim() // The new 4th piece of data!
      });
    }

    // Remove the data tokens from the text so the user doesn't see them
    cleanText = cleanText.replace(cardRegex, '').trim();

    return (
      <>
        {cleanText && (
          <div dangerouslySetInnerHTML={{__html: marked(cleanText).replace(/<p>|<\/p>/g, "")}}></div>
        )}
        {cards.length > 0 && (
          <div className="generative-ui-wrapper">
            {cards.map((card, index) => (
              <ProductCard 
                key={index} 
                partNumber={card.partNumber} 
                price={card.price} 
                name={card.name} 
                productUrl={card.productUrl} // Pass it to the component
              />
            ))}
          </div>
        )}
      </>
    );
  };
  return (
      <div className="messages-container">
          {messages.map((message, index) => (
              <div key={index} className={`${message.role}-message-container`}>
                  {message.content && (
                      <div className={`message ${message.role}-message`}>
                          {/* We now pass the content through our parser before rendering */}
                          {message.role === "assistant" 
                            ? renderMessageContent(message.content)
                            : <div dangerouslySetInnerHTML={{__html: marked(message.content).replace(/<p>|<\/p>/g, "")}}></div>
                          }
                      </div>
                  )}
              </div>
          ))}
          
          {isLoading && (
            <div className="assistant-message-container">
               <div className="message assistant-message"><em>Typing...</em></div>
            </div>
          )}

          <div ref={messagesEndRef} />
          
          <div className="input-area">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about a part, like PS11752778..."
              disabled={isLoading}
              onKeyPress={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  handleSend(input);
                  e.preventDefault();
                }
              }}
            />
            <button 
              className="send-button" 
              onClick={() => handleSend(input)} 
              disabled={isLoading || input.trim() === ""}
            >
              Send
            </button>
          </div>
      </div>
  );
}

export default ChatWindow;