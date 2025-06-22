'use client'

import { useEffect, useState } from 'react'
import { auth, db, storage, firebaseApp } from '@/lib/firebase'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { useRouter } from 'next/navigation'
import {
  doc,
  getDoc,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  deleteDoc
} from 'firebase/firestore'

import { ref, uploadBytes, getDownloadURL, getStorage } from 'firebase/storage'


export default function Dashboard() {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState('')
  const [tasks, setTasks] = useState([])
  const [userList, setUserList] = useState([])
  const [allTasks, setAllTasks] = useState([])
  const [notifications, setNotifications] = useState([])
  const [showNotification, setShowNotification] = useState(false)
  const [newComment, setNewComment] = useState({})
  const [commentsMap, setCommentsMap] = useState({})
  const [showAllComments, setShowAllComments] = useState({})
  const [uploadingImages, setUploadingImages] = useState({}) // track upload progress
  const [selectedImages, setSelectedImages] = useState({}) // store selected files
  
  const [showModal, setShowModal] = useState(false)

  const [activeTab, setActiveTab] = useState('ongoing')


  const router = useRouter()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser)

        const userDoc = await getDoc(doc(db, 'users', currentUser.uid))
        if (userDoc.exists()) {
          setRole(userDoc.data().role)
        }

        const usersSnap = await getDocs(collection(db, 'users'))
        const allUsers = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        setUserList(allUsers)

        const notifQuery = query(
          collection(db, 'notifications'),
          where('userEmail', '==', currentUser.email),
          orderBy('timestamp', 'desc')
        )
        onSnapshot(notifQuery, snapshot => {
          const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
          setNotifications(fetched)
        })
      } else {
        router.push('/login')
      }
    })
    return () => unsubscribe()
  }, [])


  useEffect(() => {
    const fetchTasks = async () => {
      if (user) {
        const q = query(
          collection(db, 'tasks'),
          where('assignedTo', '==', user.email),
          orderBy('deadline')
        )
        const snapshot = await getDocs(q)
        const tasksData = snapshot.docs.map(doc => {
          const data = doc.data()
          return { id: doc.id, ...data, deadline: data.deadline?.toDate?.() || new Date(data.deadline) }
        })
        setTasks(tasksData)
      }
    }
    fetchTasks()
  }, [user])

  useEffect(() => {
    if (role === 'admin') {
      const q = query(collection(db, 'tasks'), orderBy('deadline'))
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetched = snapshot.docs.map(doc => {
          const data = doc.data()
          return {
            id: doc.id,
            ...data,
            deadline: data.deadline?.toDate?.() || new Date(data.deadline)
          }
        })
        setAllTasks(fetched)

        fetched.forEach(task => {
          const commentsRef = collection(db, 'tasks', task.id, 'comments')
          const commentsQuery = query(commentsRef, orderBy('createdAt'))
          onSnapshot(commentsQuery, snap => {
            setCommentsMap(prev => ({
              ...prev,
              [task.id]: snap.docs.map(d => ({ id: d.id, ...d.data() }))
            }))
          })
        })
      })
      return () => unsubscribe()
    }
  }, [role])

  useEffect(() => {
    if (role === 'user' && tasks.length > 0) {
      tasks.forEach(task => {
        const commentsRef = collection(db, 'tasks', task.id, 'comments')
        const commentsQuery = query(commentsRef, orderBy('createdAt'))
        onSnapshot(commentsQuery, snap => {
          setCommentsMap(prev => ({
            ...prev,
            [task.id]: snap.docs.map(d => ({ id: d.id, ...d.data() }))
          }))
        })
      })
    }
  }, [role, tasks])

 // Complete handleAddComment function
const handleAddComment = async (taskId) => {
  if (!newComment[taskId] && !selectedImages[taskId]) return
  
  try {
    setUploadingImages(prev => ({ ...prev, [taskId]: true }))
    
    let imageDataUrls = []
    
    // Convert images to base64 (works without CORS issues)
    if (selectedImages[taskId] && selectedImages[taskId].length > 0) {
      const imagePromises = Array.from(selectedImages[taskId]).map(file => {
        return new Promise((resolve) => {
          const reader = new FileReader()
          reader.onload = (e) => resolve({
            data: e.target.result,
            name: file.name,
            type: file.type,
            size: file.size
          })
          reader.readAsDataURL(file)
        })
      })
      
      imageDataUrls = await Promise.all(imagePromises)
    }
    
    // Add comment to Firestore
    const commentRef = collection(db, 'tasks', taskId, 'comments')
    await addDoc(commentRef, {
      text: newComment[taskId] || '',
      images: imageDataUrls,
      createdAt: serverTimestamp(),
      author: user.email
    })
    
    // Clear inputs
    setNewComment(prev => ({ ...prev, [taskId]: '' }))
    setSelectedImages(prev => ({ ...prev, [taskId]: null }))

    // Add notification
    const task = allTasks.find(t => t.id === taskId) || tasks.find(t => t.id === taskId)
    if (task) {
      await addDoc(collection(db, 'notifications'), {
        userEmail: task.assignedTo,
        message: `New comment on task: ${task.title}`,
        timestamp: new Date(),
        read: false,
        type: 'comment',
        taskId
      })
    }
    
  } catch (error) {
    console.error('Error adding comment:', error)
    alert('Failed to post comment. Please try again.')
  } finally {
    setUploadingImages(prev => ({ ...prev, [taskId]: false }))
  }
}

// Handle image selection with size limits
const handleImageSelect = (taskId, files) => {
  const validFiles = Array.from(files).filter(file => {
    const isImage = file.type.startsWith('image/')
    const isValidSize = file.size <= 2 * 1024 * 1024 // 2MB limit for base64
    return isImage && isValidSize
  })
  
  if (validFiles.length !== files.length) {
    alert('Some files were not selected. Please ensure all files are images under 2MB.')
  }
  
  setSelectedImages(prev => ({ ...prev, [taskId]: validFiles }))
}


  const deleteTask = async (taskId) => {
    if (confirm('Are you sure you want to delete this task?')) {
      await deleteDoc(doc(db, 'tasks', taskId))
    }
  }

  const toggleShowComments = (taskId) => {
    setShowAllComments(prev => ({
      ...prev,
      [taskId]: !prev[taskId]
    }))
  }

  const updateStatus = async (taskId, newStatus) => {
    const taskRef = doc(db, 'tasks', taskId)
    await updateDoc(taskRef, { status: newStatus })
  }

  const markAsRead = async (notifId) => {
    await updateDoc(doc(db, 'notifications', notifId), { read: true })
  }

  const unreadNotifications = notifications.filter(n => !n.read)
  const deleteNotification = async (notifId) => {
    await deleteDoc(doc(db, 'notifications', notifId))
  }

  const NotificationBell = () => {
    const grouped = notifications.reduce((acc, notif) => {
      const { taskId = 'general' } = notif
      if (!acc[taskId]) acc[taskId] = []
      acc[taskId].push(notif)
      return acc
    }, {})

    return (
      <div className="fixed top-4 right-4 z-50">
        <div className="relative">
          <button
            className="text-2xl"
            onClick={() => setShowNotification(prev => !prev)}
          >🔔</button>
          {unreadNotifications.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-[#E4002B] text-white text-xs px-1 rounded-full">
              {unreadNotifications.length}
            </span>
          )}
          {showNotification && (
            <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white border border-gray-300 rounded shadow-lg p-2 z-50 text-sm">
              {Object.entries(grouped).map(([taskId, group]) => (
                <div key={taskId} className="mb-3">
                  <div className="font-semibold mb-1 text-[#E4002B]">
                    {taskId === 'general'
                      ? 'General Notifications'
                      : `Task: ${allTasks.find(t => t.id === taskId)?.title || 'Unknown Task'}`}
                  </div>
                  {group.map(notif => (
                    <div
                      key={notif.id}
                      className={`flex justify-between items-start p-2 rounded hover:bg-gray-100 ${notif.read ? 'text-gray-400' : 'text-black'}`}
                    >
                      <div
                        className="flex-1 cursor-pointer"
                        onClick={() => markAsRead(notif.id)}
                      >
                        {notif.message}
                      </div>
                      <button
                        className="text-red-500 text-xs ml-2"
                        onClick={() => deleteNotification(notif.id)}
                        title="Delete Notification"
                      >🗑️</button>
                    </div>
                  ))}
                </div>
              ))}
              {notifications.length === 0 && (
                <p className="text-center text-gray-500">No notifications</p>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  
  const renderComments = (taskId) => {
  const allComments = commentsMap[taskId] || []
  const latest = allComments.slice(-1)[0]
  const isExpanded = showAllComments[taskId]
  const assignedUser = userList.find(u => u.email === allTasks.find(t => t.id === taskId)?.assignedTo)

  const CommentItem = ({ comment, index }) => (
    <div key={index} className="border-b pb-2 mb-2">
      <div className="flex items-start justify-between">
        <p className="text-sm">
          <span className="font-medium">{comment.author}:</span> {comment.text}
        </p>
        <span className="text-xs text-gray-500 ml-2">
          {comment.createdAt?.toDate?.()?.toLocaleString() || 'Just now'}
        </span>
      </div>

      {comment.images && comment.images.length > 0 && (
  <div className="mt-2 flex flex-wrap gap-2">
    {comment.images.map((image, imgIndex) => {
      const imageSrc = image.data;

      const handleOpenImage = () => {
        try {
          // Extract base64 string from data URL
          const base64 = imageSrc.split(',')[1];
          const byteCharacters = atob(base64);
          const byteArrays = [];

          for (let i = 0; i < byteCharacters.length; i++) {
            byteArrays.push(byteCharacters.charCodeAt(i));
          }

          const byteArray = new Uint8Array(byteArrays);
          const blob = new Blob([byteArray], { type: image.type || 'image/png' });
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank');
        } catch (err) {
          console.error('Failed to open image:', err);
        }
      };

      return (
        <div key={imgIndex} className="relative group">
          <img
            src={imageSrc}
            alt={image.name || 'Uploaded image'}
            className="w-16 h-16 object-cover rounded border cursor-pointer hover:opacity-80 transition-opacity"
            onClick={handleOpenImage}
            onError={(e) => {
              e.target.style.border = '2px solid red';
              e.target.alt = 'Image load error';
              console.log('Image failed to load:', imageSrc);
            }}
          />
          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 rounded transition-all duration-200 flex items-center justify-center pointer-events-none">
            <span className="text-white text-xs opacity-0 group-hover:opacity-100">
              Click to view
            </span>
          </div>
        </div>
      );
    })}
  </div>
)}


    </div>
  )

  return (
    <div className="mt-2">
      {latest && !isExpanded && <CommentItem comment={latest} index={0} />}
      {isExpanded && allComments.map((comment, index) => 
        <CommentItem key={index} comment={comment} index={index} />
      )}
      
      {allComments.length > 1 && (
        <button
          className="text-xs text-[#E4002B] mt-1"
          onClick={() => setShowAllComments(prev => ({ ...prev, [taskId]: !prev[taskId] }))}
        >
          {isExpanded ? 'Hide comments' : `Show all ${allComments.length} comments`}
        </button>
      )}
      
      {assignedUser?.whatsapp && (
        <a
          href={`https://wa.me/${assignedUser.whatsapp}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-green-600 underline mt-1 block"
        >
          Continue conversation on WhatsApp
        </a>
      )}
    </div>
  )
}

// Remove selected image
const removeSelectedImage = (taskId, index) => {
  setSelectedImages(prev => {
    const current = prev[taskId] || []
    const updated = current.filter((_, i) => i !== index)
    return { ...prev, [taskId]: updated.length > 0 ? updated : null }
  })
}

  const handleStatusChange = async (taskId, newStatus) => {
    const taskRef = doc(db, 'tasks', taskId);
    await updateDoc(taskRef, { status: newStatus });
  };

  const renderTaskCard = (task) => (
  <div key={task.id} className="task-card p-4 rounded-xl mb-4 bg-white shadow hover:shadow-md transition-transform">
    <p className="text-lg font-semibold text-[#E4002B]">📌 {task.title}</p>
    <p><strong>Assigned To:</strong> {task.assignedTo}</p>
    <p><strong>Status:</strong> {task.status}</p>
    <p><strong>Deadline:</strong> {task.deadline.toLocaleDateString()}</p>
    <p className="break-words whitespace-normal"><strong>Drive Link:</strong> <a href={task.driveLink} target="_blank" className="text-[#E4002B] underline">{task.driveLink}</a></p>

    {/* Progress Bar */}
    <div className="w-full bg-gray-200 h-2 rounded mt-2">
      <div
        className={`h-2 rounded ${task.status === 'done' ? 'bg-green-500' : task.status === 'working' ? 'bg-yellow-500' : 'bg-gray-400'}`}
        style={{ width: task.status === 'done' ? '100%' : task.status === 'working' ? '50%' : '10%' }}
      />
    </div>

    {/* Admin: Status Controls */}
    {role === 'admin' && (
      <div className="mt-3">
        <label className="text-sm mr-2 font-medium">Change Status:</label>
        <select
          value={task.status}
          onChange={(e) => handleStatusChange(task.id, e.target.value)}
          className="border px-2 py-1 text-sm rounded"
        >
          <option value="pending">Pending</option>
          <option value="working">Working</option>
          <option value="done">Done</option>
        </select>
      </div>
    )}

    {/* Comments Section */}
    <div className="mt-3">
       <h4 className="font-semibold">💬 Comments</h4>
  {renderComments(task.id)}
  
  {/* Comment Input Section */}
  <div className="mt-3 border-t pt-3">
    {/* Text Input */}
    <div className="flex gap-2 mb-2">
      <input
        className="flex-1 border p-2 text-sm rounded"
        value={newComment[task.id] || ''}
        onChange={(e) => setNewComment(prev => ({ ...prev, [task.id]: e.target.value }))}
        placeholder="Write a comment..."
        disabled={uploadingImages[task.id]}
      />
    </div>
    
    {/* Image Preview Section */}
    {selectedImages[task.id] && selectedImages[task.id].length > 0 && (
      <div className="mb-2 p-2 border rounded bg-gray-50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">
            Selected Images ({selectedImages[task.id].length})
          </span>
          <button
            onClick={() => setSelectedImages(prev => ({ ...prev, [task.id]: null }))}
            className="text-xs text-red-600 hover:text-red-800"
          >
            Remove all
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from(selectedImages[task.id]).map((file, index) => (
            <div key={index} className="relative group">
              <img
                src={URL.createObjectURL(file)}
                alt={`Preview ${index + 1}`}
                className="w-16 h-16 object-cover rounded border"
              />
              <button
                onClick={() => removeSelectedImage(task.id, index)}
                className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
              >
                ×
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-1 rounded-b truncate">
                {file.name}
              </div>
            </div>
          ))}
        </div>
      </div>
    )}
    
    {/* Action Buttons */}
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {/* Image Upload Button */}
        <label className="cursor-pointer">
          <input
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => handleImageSelect(task.id, e.target.files)}
            disabled={uploadingImages[task.id]}
          />
          <div className="flex items-center gap-1 px-3 py-1 border rounded text-sm hover:bg-gray-50 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>Attach Images</span>
          </div>
        </label>
        
        {/* File info */}
        <span className="text-xs text-gray-500">
          Max 5MB per image
        </span>
      </div>
      
      {/* Post Button */}
      <button
        className={`text-sm px-4 py-2 rounded transition-colors ${
          uploadingImages[task.id]
            ? 'bg-gray-400 text-white cursor-not-allowed'
            : 'bg-[#E4002B] text-white hover:bg-red-700'
        }`}
        onClick={() => handleAddComment(task.id)}
        disabled={uploadingImages[task.id] || (!newComment[task.id] && !selectedImages[task.id])}
      >
        {uploadingImages[task.id] ? (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>Posting...</span>
          </div>
        ) : (
          'Post'
        )}
      </button>
    </div>
  </div>

      {/* Delete Task */}
      {role === 'admin' && (
        <button
          onClick={() => deleteTask(task.id)}
          className="mt-2 text-xs text-red-500 underline"
        >🗑️ Delete Task</button>
      )}
    </div>
  </div>
);


  const ongoingTasks = allTasks.filter(task => task.status !== 'done')
  const completedTasks = allTasks.filter(task => task.status === 'done')

  return (
    <div className="min-h-screen bg-[#fdfdfd00] text-gray-800 max-w-[1400px] mx-auto px-5 py-12 sm:px-20 sm:py-12">

      <NotificationBell />
      <h2 className="text-3xl font-bold text-[#E4002B] mb-4 mt-[50px]">Dashboard</h2>
      {user && <p className="mb-4 text-[#E4002B]">Welcome 🥳, {user.email} ({role})</p>}
      
      {role === 'admin' && (
        <div className="mt-6">
          <button
            className="bg-[#E4002B] text-white px-6 py-2 rounded shadow"
            onClick={() => setShowModal(true)}
          >➕ Create Task</button>

          {showModal && (
            <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
              <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
                <h3 className="text-xl font-bold mb-4 text-[#E4002B]">New Task</h3>
                <form
                  className="space-y-2"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    const title = e.target.title.value
                    const description = e.target.description.value
                    const assignedTo = e.target.assignedTo.value
                    const deadline = e.target.deadline.value
                    const driveLink = e.target.driveLink.value

                    const docRef = await addDoc(collection(db, 'tasks'), {
                      title,
                      description,
                      assignedTo,
                      status: 'pending',
                      deadline: new Date(deadline),
                      driveLink
                    })

                    await addDoc(collection(db, 'notifications'), {
                      userEmail: assignedTo,
                      message: `You have been assigned a new task: ${title}`,
                      timestamp: new Date(),
                      read: false,
                      type: 'task',
                      taskId: docRef.id
                    })

                    alert('Task added!')
                    e.target.reset()
                    setShowModal(false)
                  }}
                >
                  <input name="title" placeholder="Task Title" className="w-full border p-2" required />
                  <textarea name="description" placeholder="Description" className="w-full border p-2" />
                  <select name="assignedTo" className="w-full border p-2" required>
                    <option value="">-- Select Employee --</option>
                    {userList.filter(u => u.role === 'user').map((u, index) => (
                      <option key={index} value={u.email}>{u.email}</option>
                    ))}
                  </select>
                  <input name="deadline" type="date" className="w-full border p-2" required />
                  <input name="driveLink" placeholder="Google Drive Link" className="w-full border p-2" />
                  <div className="flex justify-end space-x-2">
                    <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border rounded">Cancel</button>
                    <button type="submit" className="bg-[#E4002B] text-white px-4 py-2 rounded">Create</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <div className="mt-6">
            <h3 className="text-xl font-semibold mb-2 text-[#E4002B]">{role === 'admin' ? 'All Tasks' : 'Your Tasks'}</h3>

            {/* Tab Buttons */}
            <div className="mb-4 flex gap-4">
              <button
                className={`px-4 py-2 rounded ${activeTab === 'ongoing' ? 'bg-[#E4002B] text-white' : 'bg-gray-200'}`}
                onClick={() => setActiveTab('ongoing')}
              >
                Ongoing
              </button>
              <button
                className={`px-4 py-2 rounded ${activeTab === 'completed' ? 'bg-[#E4002B] text-white' : 'bg-gray-200'}`}
                onClick={() => setActiveTab('completed')}
              >
                Completed
              </button>
            </div>

            {/* Task Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(activeTab === 'ongoing' ? ongoingTasks : completedTasks).map(renderTaskCard)}
            </div>
          </div>

        </div>
      )}

     {role === 'user' && (
      <div className="mt-6">
        <div className="flex gap-4 mb-4">
          <button
            onClick={() => setActiveTab('ongoing')}
            className={`px-4 py-2 rounded ${activeTab === 'ongoing' ? 'bg-[#E4002B] text-white' : 'bg-gray-200'}`}
          >
            Ongoing Tasks
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            className={`px-4 py-2 rounded ${activeTab === 'completed' ? 'bg-[#E4002B] text-white' : 'bg-gray-200'}`}
          >
            Completed Tasks
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(activeTab === 'ongoing' ? tasks.filter(t => t.status !== 'done') : tasks.filter(t => t.status === 'done'))
            .map(renderTaskCard)}
        </div>
      </div>
    )}


      <button
        onClick={async () => {
          await signOut(auth)
          router.push('/login')
        }}
        className="mt-6 bg-[#E4002B] text-white px-4 py-2 rounded mb-[70px]"
      >Log Out</button>
    </div>
  )
}
