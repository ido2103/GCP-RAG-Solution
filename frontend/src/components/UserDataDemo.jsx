import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  prepareUserData, 
  getUserDataPath, 
  createUserSpecificId 
} from '../utils/userUtils';

function UserDataDemo() {
  const { userId } = useAuth();
  const [demoObject, setDemoObject] = useState(null);

  useEffect(() => {
    if (userId) {
      // Example of creating a user-specific data object
      const userData = prepareUserData({
        name: 'Example Data',
        content: 'This is sample content',
        isActive: true
      }, userId);
      
      // Set the prepared data in state
      setDemoObject(userData);
      
      // Example of logging paths that would be used in Firebase
      console.log('User data path example:', getUserDataPath('documents', userId));
      console.log('User document path example:', getUserDataPath('documents', userId, 'doc1'));
      
      // Example of creating a user-specific ID
      const userSpecificId = createUserSpecificId('document123', userId);
      console.log('User-specific document ID:', userSpecificId);
    }
  }, [userId]);

  if (!userId) {
    return <div>Please log in to see user data demo</div>;
  }

  return (
    <div style={{padding: '20px', maxWidth: '800px', margin: '0 auto'}}>
      <h2>User Data Demo</h2>
      <p>Your User ID: <strong>{userId}</strong></p>
      
      <div style={{marginTop: '20px'}}>
        <h3>Example of User-Specific Data Object:</h3>
        <pre style={{
          backgroundColor: '#f5f5f5', 
          padding: '15px', 
          borderRadius: '5px',
          overflow: 'auto'
        }}>
          {demoObject ? JSON.stringify(demoObject, null, 2) : 'Loading...'}
        </pre>
      </div>
      
      <div style={{marginTop: '20px'}}>
        <h3>How to Use the User ID in Your Code:</h3>
        <ol style={{textAlign: 'left'}}>
          <li>
            <strong>Import the useAuth hook:</strong>
            <pre>import {'{ useAuth }'} from '../contexts/AuthContext';</pre>
          </li>
          <li>
            <strong>Get the userId in your component:</strong>
            <pre>const {'{ userId }'} = useAuth();</pre>
          </li>
          <li>
            <strong>Use the utility functions to create user-specific data:</strong>
            <pre>const userDataPath = getUserDataPath('collection', userId);</pre>
          </li>
        </ol>
      </div>
    </div>
  );
}

export default UserDataDemo; 