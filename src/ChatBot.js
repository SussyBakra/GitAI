import React, { useState, useEffect, useRef } from "react";
import './ChatBot.css';
import ReactMarkdown from "react-markdown";
import { useLocation, useNavigate } from "react-router-dom";
import { useUser } from './contexts/UserContext';
import { 
  FiPlusCircle, 
  FiSend, 
  FiEdit2, 
  FiX, 
  FiMessageSquare, 
  FiMenu, 
  FiMaximize2, 
  FiMinimize2,
  FiSettings,
  FiHelpCircle
} from 'react-icons/fi';
import logo from './assets/logo-light.png';

const PRESET_QUESTIONS = {
  'Repo Architecture': "Can you analyze the architecture of my repository and suggest any improvements?",
  'Security Analysis': "Can you perform a security analysis of my codebase and identify potential vulnerabilities?",
  'Dependencies': "Can you analyze my project dependencies and suggest any updates or potential issues?"
};

const ChatBot = () => {
  const [userInput, setUserInput] = useState("");
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingIndex, setEditingIndex] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useUser();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Add auto-scroll effect
  const responsesEndRef = useRef(null);
  
  const scrollToBottom = () => {
    responsesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [responses]);

  // Add loading indicator component
  const LoadingIndicator = () => (
    <div className="loading-indicator">
      <div className="typing-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  );

  // Add timestamp formatting
  const formatTimestamp = (timestamp) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(new Date(timestamp));
  };

  // Load conversations from localStorage on component mount
  useEffect(() => {
    if (user) {
      const savedConversations = localStorage.getItem(`conversations_${user.id}`);
      if (savedConversations) {
        setConversations(JSON.parse(savedConversations));
      }
    } else {
      // Redirect to login if no user
      navigate('/login');
    }
  }, [user, navigate]);

  // Save conversations to localStorage whenever they change
  useEffect(() => {
    if (user) {
      localStorage.setItem(`conversations_${user.id}`, JSON.stringify(conversations));
    }
  }, [conversations, user]);

  const handleSend = async () => {
    if (!user) {
      setError('Please login to continue');
      return;
    }

    if (userInput.trim()) {
      setLoading(true);
      setError('');

      try {
        const response = await fetch('http://localhost:5000/query', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${user.token}` // Add auth token if you have one
          },
          body: JSON.stringify({ 
            query: userInput,
            repoLink: location.state?.repoLink,
            userId: user.id // Send user ID with the request
          }),
        });

        // if (!response.ok) {
        //   throw new Error('Failed to fetch response from server');
        // }

        const data = await response.json();
        const aiResponse = data.response || "No response from server.";
        const newResponse = { 
          question: userInput, 
          response: aiResponse,
          timestamp: new Date().toISOString()
        };

        if (editingIndex !== null) {
          const updatedResponses = [...responses];
          updatedResponses[editingIndex] = newResponse;
          setResponses(updatedResponses);
          setEditingIndex(null);
        } else {
          setResponses(prev => [...prev, newResponse]);
          
          // Update conversations
          if (selectedConversation !== null) {
            // Update existing conversation
            const updatedConversations = conversations.map((conv, index) => {
              if (index === selectedConversation) {
                return {
                  ...conv,
                  messages: [...conv.messages, newResponse],
                  lastUpdated: new Date().toISOString()
                };
              }
              return conv;
            });
            setConversations(updatedConversations);
          } else {
            // Create new conversation
            const newConversation = {
              id: Date.now(),
              userId: user.id,
              title: `Conversation ${conversations.length + 1}`,
              messages: [newResponse],
              lastUpdated: new Date().toISOString(),
              repoLink: location.state?.repoLink
            };
            setConversations(prev => [...prev, newConversation]);
            setSelectedConversation(conversations.length);
          }
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
        setUserInput("");
      }
    }
  };

  const handleEdit = (index) => {
    const question = responses[index]?.question;
    if (question !== undefined) {
      setUserInput(question);
      setEditingIndex(index);
    }
  };

  const handleCancelEdit = () => {
    setUserInput("");
    setEditingIndex(null);
  };

  const selectConversation = (index) => {
    setSelectedConversation(index);
    setResponses(conversations[index].messages);
    setEditingIndex(null);
  };

  const startNewConversation = () => {
    setSelectedConversation(null);
    setResponses([]);
    setEditingIndex(null);
    setUserInput("");
  };

  // Toggle fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleActionButtonClick = (questionType) => {
    const question = PRESET_QUESTIONS[questionType];
    setUserInput(question);
  };

  return (
    <div className="app-container">
      <div className={`chatbot-layout ${isSidebarOpen ? '' : 'sidebar-collapsed'}`}>
        {/* Sidebar */}
        <div className="conversation-sidebar">
          <div className="sidebar-header">
            <button className="new-chat-btn" onClick={startNewConversation}>
              <FiPlusCircle className="icon" />
              <span>New Chat</span>
            </button>
          </div>
          
          <div className="conversation-list">
            {conversations.map((conv, index) => (
              <div
                key={conv.id}
                className={`conversation-item ${selectedConversation === index ? 'selected' : ''}`}
                onClick={() => selectConversation(index)}
              >
                <FiMessageSquare className="conversation-icon" />
                <div className="conversation-details">
                  <span className="conversation-title">{conv.title}</span>
                  <span className="conversation-date">
                    {formatTimestamp(conv.lastUpdated)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="sidebar-footer">
            <button className="sidebar-btn">
              <FiSettings />
              <span>Settings</span>
            </button>
            <button className="sidebar-btn">
              <FiHelpCircle />
              <span>Help</span>
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="chatbot-container">
          <div className="chat-header">
            <button 
              className="menu-btn"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            >
              <FiMenu />
            </button>
            <img src={logo} alt="GitAI Logo" className="header-logo" />
            <div className="header-actions">
              <button 
                className="header-btn"
                onClick={toggleFullscreen}
              >
                {isFullscreen ? <FiMinimize2 /> : <FiMaximize2 />}
              </button>
            </div>
          </div>

          <div className="responses">
            {responses.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">
                  🤖
                </div>
                <h2>How can I help you today?</h2>
                <p>Ask me anything about your code or development questions.</p>
                <div className="action-buttons">
                  <button 
                    className="action-button" 
                    onClick={() => handleActionButtonClick('Repo Architecture')}
                  >
                    Repo Architecture
                  </button>
                  <button 
                    className="action-button" 
                    onClick={() => handleActionButtonClick('Security Analysis')}
                  >
                    Security Analysis
                  </button>
                  <button 
                    className="action-button" 
                    onClick={() => handleActionButtonClick('Dependencies')}
                  >
                    Dependencies
                  </button>
                </div>
              </div>
            ) : (
              <>
                {responses.map((item, index) => (
                  <div key={index} className="response">
                    <div className="message user-message">
                      <div className="message-header">
                        <FiMessageSquare />
                        <span>You</span>
                        <button 
                          className="edit-btn"
                          onClick={() => handleEdit(index)}
                        >
                          <FiEdit2 />
                        </button>
                      </div>
                      {item.question}
                    </div>
                    <div className="message ai-message">
                      <div className="message-header">
                        🤖
                        <span>GitAI</span>
                      </div>
                      <ReactMarkdown>{item.response}</ReactMarkdown>
                    </div>
                  </div>
                ))}
                <div ref={responsesEndRef} />
              </>
            )}
            {loading && <LoadingIndicator />}
            {error && <div className="error-message">{error}</div>}
          </div>

          <div className="input-container">
            <div className="input-wrapper">
              <input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Type your message..."
              />
              {editingIndex !== null && (
                <button 
                  className="cancel-btn"
                  onClick={handleCancelEdit}
                >
                  <FiX />
                </button>
              )}
              <button 
                className="send-btn"
                onClick={handleSend}
                disabled={!userInput.trim()}
              >
                <FiSend />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatBot;

