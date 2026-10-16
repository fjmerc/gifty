// This file creates a base64 encoded notification sound
// This approach is used since we can't directly upload an audio file

// Base64 encoded MP3 for a simple notification sound
// This is a short "ding" sound that's commonly used for notifications
export const notificationSoundBase64 = "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAAAwAAAbAAiIiIiIiIiIiIiIiIiIiIiIiIv7+/v7+/v7+/v7+/v7+/v7+/v7/f39/f39/f39/f39/f39/f39/f3////////////////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/jOMAAAANDADIAAAAAEf//Kif/V7DPOAJ/tI5TMt/p6Emk/wkUhFLpI/kkBmf/pGH/+yKJwRB0zI0xA4j/4zjEJjADAC8CNwJDJzBqAFBwUAJY8JRwAAADxzT6tXzVcuAcKwn5wDg8AIRQFFZRMTzOd5QChINRYVAQXQBgdSAUigqCLf/jOMSbMBEAMwEmAk7AaAwoHFADWgJBAAAKKABIBQCAIgFIQE/ZzMUcOLCgqLwSB6OwJ8PidDcQCtTJYXAeI0NBMDBQNV//4zjEnzAXACsAKARzAaAIQHAgGCCUcAAACcjCh6MUwSAKQpnASxgNFRzEPFp2rqClMM47TIHAziJQvI2JDoPCIVOAoAiw/+M4xKgwGQArABICRkEIAIAIGCEsEAAAYkDTI6yNGjYGE4kCgAIBTLGnJ+U8OQJGYUCeARgcUAUhQUj8ChcJNOKnCX4//+M4xLUwGwAnACYCUyAc4oAxQFgYCTwAAAIYI/7I+MhQHGSEWy0ZDaZmRbSRSI/dESXHQHA4xUEWAgEXjW9xGZkKZkFwH//jOMTBLBsAGgAiAnZAOJqHgY3zwAAAf+4NdFpkm1m+f6P8pMHgVBIPlgPJ7O57NJ9NYTlJCQYl9SmkM9VFhk9IjBSw/+M4xNYcESQ/ICYuJDgwJWg6MkQUTKHmMbZl8ykKGwZqr5ukK8i3f6rqvUy3dj/d0OXN0ZHMxxw2KyZKIlgjF53t7azJ/////u9Qf/O0v//jKMTqKA8APwAAAH+ZSGFmEmzIa5wYzNlZmRrXGdbW9Zj4L7HWY9l8xwZ6";

// Export a function to create the Audio element with the sound
export const createNotificationSound = () => {
  return new Audio(notificationSoundBase64);
};

export default notificationSoundBase64;
