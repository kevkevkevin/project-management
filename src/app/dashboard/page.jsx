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
  const [uploadingImages, setUploadingImages] = useState({})
  const [selectedImages, setSelectedImages] = useState({})
  const [showModal, setShowModal] = useState(false)
  const [activeTab, setActiveTab] = useState('ongoing')
  const [expandedTasks, setExpandedTasks] = useState({})
  const [currentTime, setCurrentTime] = useState('')
  const [currentDate, setCurrentDate] = useState('')
  const [editTask, setEditTask] = useState(null)
  const [editForm, setEditForm] = useState({ title: '', description: '', deadline: '', driveLink: '' })
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

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

  useEffect(() => {
    const updateTimeDate = () => {
      const now = new Date()
      const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Riyadh' })
      const date = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Riyadh' })
      setCurrentTime(time)
      setCurrentDate(date)
    }
    updateTimeDate()
    const interval = setInterval(updateTimeDate, 1000)
    return () => clearInterval(interval)
  }, [])

  const handleAddComment = async (taskId) => {
    if (!newComment[taskId] && !selectedImages[taskId]) return
    try {
      setUploadingImages(prev => ({ ...prev, [taskId]: true }))
      let imageDataUrls = []
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
      const commentRef = collection(db, 'tasks', taskId, 'comments')
      await addDoc(commentRef, {
        text: newComment[taskId] || '',
        images: imageDataUrls,
        createdAt: serverTimestamp(),
        author: user.email
      })
      setNewComment(prev => ({ ...prev, [taskId]: '' }))
      setSelectedImages(prev => ({ ...prev, [taskId]: null }))
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

  const handleImageSelect = (taskId, files) => {
    const validFiles = Array.from(files).filter(file => {
      const isImage = file.type.startsWith('image/')
      const isValidSize = file.size <= 2 * 1024 * 1024
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
      <div className="relative">
        <button
          className="p-3 rounded-full bg-white shadow-sm hover:shadow-md transition-all duration-300"
          onClick={() => setShowNotification(prev => !prev)}
        >
          🔔
        </button>
        {notifications.filter(n => !n.read).length > 0 && (
          <span className="absolute -top-1 -right-1 bg-[#E4002B] text-white text-xs px-2 py-1 rounded-full">
            {notifications.filter(n => !n.read).length}
          </span>
        )}
        {showNotification && (
          <div className="absolute right-0 mt-3 w-80 max-h-96 overflow-y-auto bg-white rounded-xl shadow-2xl border border-gray-100 p-4 transform scale-95 transition-transform duration-300">
            {Object.entries(grouped).map(([taskId, group]) => (
              <div key={taskId} className="mb-4">
                <div className="font-semibold text-[#E4002B] mb-2 text-sm">
                  {taskId === 'general'
                    ? 'General Notifications'
                    : `Task: ${allTasks.find(t => t.id === taskId)?.title || 'Unknown Task'}`}
                </div>
                {group.map(notif => (
                  <div
                    key={notif.id}
                    className={`flex justify-between items-start p-3 rounded-lg hover:bg-gray-50 transition-colors ${
                      notif.read ? 'text-gray-500' : 'text-[#1F2A44]'
                    }`}
                  >
                    <div
                      className="flex-1 cursor-pointer text-sm"
                      onClick={() => markAsRead(notif.id)}
                    >
                      {notif.message}
                    </div>
                    <button
                      className="text-red-500 text-xs ml-2 hover:text-red-600"
                      onClick={() => deleteNotification(notif.id)}
                      title="Delete Notification"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            ))}
            {notifications.length === 0 && (
              <p className="text-center text-gray-500 text-sm">No notifications</p>
            )}
          </div>
        )}
      </div>
    )
  }

  const renderComments = (taskId) => {
    const allComments = commentsMap[taskId] || []
    const latest = allComments.slice(-1)[0]
    const isExpanded = showAllComments[taskId]
    const assignedUser = userList.find(u => u.email === allTasks.find(t => t.id === taskId)?.assignedTo)

    const CommentItem = ({ comment, index }) => (
      <div key={index} className="border-b border-gray-100 pb-3 mb-3">
        <div className="flex items-start justify-between">
          <p className="text-sm text-[#1F2A44]">
            <span className="font-semibold">{comment.author}:</span> {comment.text}
          </p>
          <span className="text-xs text-gray-400 ml-2">
            {comment.createdAt?.toDate?.()?.toLocaleString() || 'Just now'}
          </span>
        </div>
        {comment.images && comment.images.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {comment.images.map((image, imgIndex) => {
              const imageSrc = image.data || (image.url ? image.url : '')
              const handleOpenImage = () => {
                try {
                  if (imageSrc.startsWith('data:')) {
                    const base64 = imageSrc.split(',')[1]
                    const byteCharacters = atob(base64)
                    const byteArrays = []
                    for (let i = 0; i < byteCharacters.length; i++) {
                      byteArrays.push(byteCharacters.charCodeAt(i))
                    }
                    const byteArray = new Uint8Array(byteArrays)
                    const blob = new Blob([byteArray], { type: image.type || 'image/png' })
                    const url = URL.createObjectURL(blob)
                    window.open(url, '_blank')
                  } else if (image.url) {
                    window.open(image.url, '_blank')
                  }
                } catch (err) {
                  console.error('Failed to open image:', err)
                  alert('Error loading image. Please try again.')
                }
              }
              return (
                <div key={imgIndex} className="relative group">
                  <img
                    src={imageSrc}
                    alt={image.name || 'Uploaded image'}
                    className="w-16 h-16 object-cover rounded-md border border-gray-100 cursor-pointer hover:opacity-80 transition-opacity duration-300"
                    onClick={handleOpenImage}
                    onError={(e) => {
                      e.target.style.border = '2px solid red'
                      e.target.alt = 'Image load error'
                      console.log('Image failed to load:', imageSrc)
                    }}
                  />
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 rounded-md transition-all duration-200 flex items-center justify-center pointer-events-none">
                    <span className="text-white text-xs opacity-0 group-hover:opacity-100">
                      Click to view
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )

    return (
      <div className="mt-3">
        {latest && !isExpanded && <CommentItem comment={latest} index={0} />}
        {isExpanded && allComments.map((comment, index) => (
          <CommentItem key={index} comment={comment} index={index} />
        ))}
        {allComments.length > 1 && (
          <button
            className="text-xs text-[#E4002B] hover:underline mt-2"
            onClick={() => toggleShowComments(taskId)}
          >
            {isExpanded ? 'Hide comments' : `Show all ${allComments.length} comments`}
          </button>
        )}
        {assignedUser?.whatsapp && (
          <a
            href={`https://wa.me/${assignedUser.whatsapp}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-green-600 hover:underline mt-2 block"
          >
            Continue conversation on WhatsApp
          </a>
        )}
      </div>
    )
  }

  const removeSelectedImage = (taskId, index) => {
    setSelectedImages(prev => {
      const current = prev[taskId] || []
      const updated = current.filter((_, i) => i !== index)
      return { ...prev, [taskId]: updated.length > 0 ? updated : null }
    })
  }

  const handleStatusChange = async (taskId, newStatus) => {
    const taskRef = doc(db, 'tasks', taskId)
    await updateDoc(taskRef, { status: newStatus })
  }

  const handleEditTask = (task) => {
    setEditTask(task)
    setEditForm({
      title: task.title,
      description: task.description,
      deadline: task.deadline.toISOString().split('T')[0],
      driveLink: task.driveLink || ''
    })
    setShowModal(true)
  }

  const saveEditTask = async () => {
    if (editTask) {
      const taskRef = doc(db, 'tasks', editTask.id)
      await updateDoc(taskRef, {
        title: editForm.title,
        description: editForm.description,
        deadline: new Date(editForm.deadline),
        driveLink: editForm.driveLink
      })
      setShowModal(false)
      setEditTask(null)
    }
  }

  const renderTaskCard = (task) => {
    const truncateText = (text, maxWords = 20) => {
      if (!text) return ''
      const words = text.split(/\s+/)
      if (words.length <= maxWords || expandedTasks[task.id]) return text
      return words.slice(0, maxWords).join(' ') + ' ...'
    }

    const toggleExpand = () => {
      setExpandedTasks(prev => ({
        ...prev,
        [task.id]: !prev[task.id]
      }))
    }

    return (
      <div
        key={task.id}
        className="bg-white p-6 rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 border border-gray-100 hover:scale-105"
      >
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[#E4002B] text-lg">📌</span>
          <h3 className="text-lg font-bold text-[#1F2A44]">{task.title}</h3>
        </div>
        <div className="space-y-2 text-sm text-[#1F2A44]">
          <p><span className="font-semibold">Assigned To:</span> {task.assignedTo}</p>
          <p><span className="font-semibold">Status:</span> {task.status}</p>
          <div className="mt-2">
            <span className="font-semibold">Description:</span>{' '}
            <p
              className={`inline text-sm text-[#1F2A44] ${!expandedTasks[task.id] ? 'line-clamp-2' : ''}`}
              dangerouslySetInnerHTML={{ __html: truncateText(task.description) }}
            />
            {!expandedTasks[task.id] && task.description && task.description.split(/\s+/).length > 20 && (
              <button
                onClick={toggleExpand}
                className="text-xs text-[#E4002B] hover:underline mt-1"
              >
                ...read more
              </button>
            )}
            {expandedTasks[task.id] && (
              <button
                onClick={toggleExpand}
                className="text-xs text-[#E4002B] hover:underline mt-1"
              >
                show less
              </button>
            )}
          </div>
          <p><span className="font-semibold">Deadline:</span> {task.deadline.toLocaleDateString()}</p>
          <p className="break-words">
            <span className="font-semibold">Drive Link:</span>{' '}
            <a href={task.driveLink} target="_blank" className="text-[#E4002B] hover:underline">
              {task.driveLink}
            </a>
          </p>
        </div>

        <div className="mt-4">
          <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                task.status === 'done'
                  ? 'bg-green-500'
                  : task.status === 'working'
                  ? 'bg-yellow-500'
                  : 'bg-gray-400'
              }`}
              style={{
                width: task.status === 'done' ? '100%' : task.status === 'working' ? '50%' : '10%',
              }}
            />
          </div>
        </div>

        {role === 'admin' && (
          <div className="mt-4">
            <label className="text-sm font-semibold text-[#1F2A44]">Change Status:</label>
            <select
              value={task.status}
              onChange={(e) => handleStatusChange(task.id, e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-md p-2 text-sm focus:ring-[#E4002B] focus:border-[#E4002B] transition-colors"
            >
              <option value="pending">Pending</option>
              <option value="working">Working</option>
              <option value="done">Done</option>
            </select>
          </div>
        )}

        <div className="mt-4">
          <h4 className="font-semibold text-[#1F2A44] mb-2 text-sm">💬 Comments</h4>
          {renderComments(task.id)}
          <div className="mt-4 border-t border-gray-100 pt-4">
            <input
              className="w-full border border-gray-200 rounded-md p-3 text-sm focus:ring-[#E4002B] focus:border-[#E4002B] transition-colors"
              value={newComment[task.id] || ''}
              onChange={(e) => setNewComment(prev => ({ ...prev, [task.id]: e.target.value }))}
              placeholder="Write a comment..."
              disabled={uploadingImages[task.id]}
            />
            {selectedImages[task.id] && selectedImages[task.id].length > 0 && (
              <div className="mt-3 p-3 border border-gray-100 rounded-md bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-[#1F2A44]">
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
                        className="w-16 h-16 object-cover rounded-md border border-gray-100"
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
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-2">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleImageSelect(task.id, e.target.files)}
                    disabled={uploadingImages[task.id]}
                  />
                  <div className="flex items-center gap-1 px-4 py-2 border border-gray-200 rounded-md text-sm hover:bg-gray-50 transition-colors">
                    <svg className="w-4 h-4 text-[#1F2A44]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>Attach Images</span>
                  </div>
                </label>
                <span className="text-xs text-gray-500">Max 5MB per image</span>
              </div>
              <button
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-300 ${
                  uploadingImages[task.id]
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-[#E4002B] text-white hover:bg-red-700 hover:scale-105'
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
          {role === 'admin' && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => deleteTask(task.id)}
                className="text-xs text-red-500 hover:underline"
              >
                🗑️ Delete Task
              </button>
              <button
                onClick={() => handleEditTask(task)}
                className="text-xs text-blue-500 hover:underline"
              >
                ✍️ Edit Task
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  const ongoingTasks = allTasks.filter(task => task.status !== 'done')
  const completedTasks = allTasks.filter(task => task.status === 'done')

  return (
    <div className="min-h-screen flex font-sans relative">
      <button
        className="md:hidden fixed top-6 left-6 z-50 p-2 bg-[#E4002B] text-white rounded-md"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
        </svg>
      </button>

      <aside
        className={`w-64 h-screen bg-[#E4002B] text-white p-6 fixed z-50 transition-transform duration-300 ease-in-out ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
        <div className="mb-8">
          <img
            src="/logo.png"
            alt="Logo"
            className="w-20 h-auto mx-auto mb-6"
          />
        </div>
        {role === 'admin' && (
          <button
            className="w-full px-4 py-2 bg-white text-[#E4002B] rounded-md font-medium hover:bg-gray-200 hover:scale-105 transition-all duration-300 mb-4"
            onClick={() => setShowModal(true)}
          >
            📌 Create Task
          </button>
        )}
        <div className="mt-auto">
          <p className="text-sm mb-4">Our Social Media ✌🏻:</p>
          <div className="flex flex-col gap-2">
            <a
              href="https://www.linkedin.com/company/sliders-agency/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white hover:text-gray-200 transition-colors flex items-center gap-2"
            >
              LinkedIn
            </a>
            <a
              href="https://www.instagram.com/slidersagency/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white hover:text-gray-200 transition-colors flex items-center gap-2"
            >
              Instagram
            </a>
            <a
              href="https://x.com/slidersagency"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white hover:text-gray-200 transition-colors flex items-center gap-2"
            >
              Twitter
            </a>
            <a
              href="https://sliders.agency/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white hover:text-gray-200 transition-colors flex items-center gap-2"
            >
              Sliders.agency
            </a>
          </div>
          <div className="mt-20">
            <button
              onClick={async () => {
                await signOut(auth)
                router.push('/login')
              }}
              className="w-full px-5 py-2 bg-white text-[#E4002B] rounded-md font-medium hover:bg-gray-200 hover:scale-105 transition-all duration-300"
            >
              🔐 Log Out
            </button>
          </div>
        </div>
      </aside>

      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <div className="flex-1">
        <div className="min-h-screen bg-[#F7F9FC] text-[#1F2A44] px-4 sm:px-6 lg:px-8 py-12">
          <div className="max-w-7xl mx-auto">
            <div className="fixed top-6 right-6 flex items-center gap-4 z-50">
              <div className="relative w-48 h-12 perspective-1000">
                <div className="absolute w-full h-full bg-[#E4002B] rounded-lg shadow-2xl transform rotate-x-10 text-center p-2 text-white font-semibold text-xs transition-all duration-300 hover:rotate-x-0 hover:translate-y-2 hover:shadow-3xl">
                  <img className='absolute w-[30px] left-[-14px] top-[-10px] animate-bounce' src='https://cdn3d.iconscout.com/3d/premium/thumb/alarm-clock-3d-icon-download-in-png-blend-fbx-gltf-file-formats--time-education-pack-school-icons-5191668.png' />
                  <div className="transform -rotate-x-10">{currentTime}</div>
                  <div className="text-[10px] transform -rotate-x-10">{currentDate}</div>
                </div>
                <div className="absolute w-full h-full bg-gradient-to-br from-[#A30020] to-[#7A0018] rounded-lg shadow-lg transform rotate-x-5 translate-y-1 -z-10 opacity-70"></div>
              </div>
              <NotificationBell />
            </div>
            <div className="flex flex-col sm:flex-row justify-between items-center mb-10 mt-12">
              <div>
                <h2 className="text-4xl font-bold text-[#E4002B] tracking-tight">Sliders Dashboard</h2>
                {user && (
                  <p className="mt-2 text-sm text-[#1F2A44]">
                    Welcome 🥳, {user.email} ({role})
                  </p>
                )}
              </div>
            </div>

            {role === 'admin' && (
              <div>
                <div className="flex justify-between items-center mb-8">
                  <h3 className="text-xl font-bold text-[#1F2A44]">All Tasks</h3>
                </div>

                {showModal && (
                  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md transform scale-95 transition-transform duration-300">
                      <h3 className="text-xl font-bold text-[#E4002B] mb-4">
                        {editTask ? 'Edit Task' : 'Create New Task'}
                      </h3>
                      <form
                        className="space-y-4"
                        onSubmit={(e) => {
                          e.preventDefault()
                          if (editTask) {
                            saveEditTask()
                          } else {
                            const title = e.target.title.value
                            const description = e.target.description.value
                            const assignedTo = e.target.assignedTo.value
                            const deadline = e.target.deadline.value
                            const driveLink = e.target.driveLink.value
                            addDoc(collection(db, 'tasks'), {
                              title,
                              description,
                              assignedTo,
                              status: 'pending',
                              deadline: new Date(deadline),
                              driveLink,
                            }).then((docRef) => {
                              addDoc(collection(db, 'notifications'), {
                                userEmail: assignedTo,
                                message: `You have been assigned a new task: ${title}`,
                                timestamp: new Date(),
                                read: false,
                                type: 'task',
                                taskId: docRef.id,
                              })
                            })
                            alert('Task added!')
                            e.target.reset()
                            setShowModal(false)
                          }
                        }}
                      >
                        <input
                          name="title"
                          value={editForm.title}
                          onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                          placeholder="Task Title"
                          className="w-full border border-gray-200 rounded-md p-3 text-sm focus:ring-[#E4002B] focus:border-[#E4002B] transition-colors"
                          required
                        />
                        <textarea
                          name="description"
                          value={editForm.description}
                          onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                          placeholder="Description"
                          className="w-full border border-gray-200 rounded-md p-3 text-sm focus:ring-[#E4002B] focus:border-[#E4002B] transition-colors"
                        />
                        {!editTask && (
                          <select
                            name="assignedTo"
                            className="w-full border border-gray-200 rounded-md p-3 text-sm focus:ring-[#E4002B] focus:border-[#E4002B] transition-colors"
                            required
                          >
                            <option value="">-- Select Employee --</option>
                            {userList
                              .filter(u => u.role === 'user')
                              .map((u, index) => (
                                <option key={index} value={u.email}>
                                  {u.email}
                                </option>
                              ))}
                          </select>
                        )}
                        <input
                          name="deadline"
                          type="date"
                          value={editForm.deadline}
                          onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value })}
                          className="w-full border border-gray-200 rounded-md p-3 text-sm focus:ring-[#E4002B] focus:border-[#E4002B] transition-colors"
                          required
                        />
                        <input
                          name="driveLink"
                          value={editForm.driveLink}
                          onChange={(e) => setEditForm({ ...editForm, driveLink: e.target.value })}
                          placeholder="Google Drive Link"
                          className="w-full border border-gray-200 rounded-md p-3 text-sm focus:ring-[#E4002B] focus:border-[#E4002B] transition-colors"
                        />
                        <div className="flex justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setShowModal(false)
                              setEditTask(null)
                            }}
                            className="px-5 py-2 border border-gray-200 rounded-md text-sm font-medium text-[#1F2A44] hover:bg-gray-50 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="px-5 py-2 bg-[#E4002B] text-white rounded-md text-sm font-medium hover:bg-red-700 hover:scale-105 transition-all duration-300"
                          >
                            {editTask ? 'Save' : 'Create'}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}

                <div className="mb-8 flex gap-3">
                  <button
                    className={`px-6 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${
                      activeTab === 'ongoing'
                        ? 'bg-[#E4002B] text-white'
                        : 'bg-white text-[#1F2A44] border border-gray-200 hover:bg-gray-50 hover:scale-105'
                    }`}
                    onClick={() => setActiveTab('ongoing')}
                  >
                    Ongoing
                  </button>
                  <button
                    className={`px-6 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${
                      activeTab === 'completed'
                        ? 'bg-[#E4002B] text-white'
                        : 'bg-white text-[#1F2A44] border border-gray-200 hover:bg-gray-50 hover:scale-105'
                    }`}
                    onClick={() => setActiveTab('completed')}
                  >
                    Completed
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {(activeTab === 'ongoing' ? ongoingTasks : completedTasks).map(renderTaskCard)}
                </div>
              </div>
            )}

            {role === 'user' && (
              <div>
                <div className="mb-8 flex gap-3">
                  <button
                    className={`px-6 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${
                      activeTab === 'ongoing'
                        ? 'bg-[#E4002B] text-white'
                        : 'bg-white text-[#1F2A44] border border-gray-200 hover:bg-gray-50 hover:scale-105'
                    }`}
                    onClick={() => setActiveTab('ongoing')}
                  >
                    Ongoing Tasks
                  </button>
                  <button
                    className={`px-6 py-2 rounded-full text-sm font-semibold transition-all duration-300 ${
                      activeTab === 'completed'
                        ? 'bg-[#E4002B] text-white'
                        : 'bg-white text-[#1F2A44] border border-gray-200 hover:bg-gray-50 hover:scale-105'
                    }`}
                    onClick={() => setActiveTab('completed')}
                  >
                    Completed Tasks
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {(activeTab === 'ongoing'
                    ? tasks.filter(t => t.status !== 'done')
                    : tasks.filter(t => t.status === 'done')
                  ).map(renderTaskCard)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}