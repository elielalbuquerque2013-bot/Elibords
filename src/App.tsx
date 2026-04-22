import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Upload, 
  Calendar as CalendarIcon, 
  Maximize2, 
  FileType, 
  CheckCircle2, 
  ArrowRight,
  Image as ImageIcon,
  X,
  Info,
  History,
  PlusCircle,
  Clock,
  CheckCircle,
  AlertCircle,
  Type,
  Image as ImageFormIcon,
  Settings,
  Edit3,
  Trash2,
  Copy,
  LogOut,
  LogIn,
  Download
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableHead } from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { db, storage, auth } from "./firebase";
import { 
  collection, 
  addDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  setDoc,
  getDoc,
  deleteField
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";

const EMBROIDERY_FORMATS = [
  "DST (Tajima)",
  "PES (Brother)",
  "JEF (Janome)",
  "XXX (Singer)",
  "EXP (Bernina)",
  "HUS (Husqvarna)",
  "VIP (Pfaff)",
  "VP3 (Pfaff/Husqvarna)",
];

const FONT_STYLES = [
  "Cursiva / Script",
  "Bastão / Sans Serif",
  "Serifada / Clássica",
  "Manuscrita",
  "Moderna / Display",
];

interface Order {
  id: string;
  date: Date;
  deliveryDate: Date;
  format: string;
  size: string;
  status: "Pendente" | "Em Produção" | "Concluído" | "Cancelado";
  intent?: "budget" | "produce";
  imagePreview: string | null;
  imageThumbnail?: string | null;
  images?: { preview: string, thumbnail: string | null, name: string }[];
  orderType: "image" | "text";
  textContent?: string;
  fontStyle?: string;
  notes?: string;
  customerName: string;
  customerWhatsapp?: string;
  fileUrl?: string;
  fileName?: string;
  matrixFiles?: { url: string, name: string }[];
}

export default function App() {
  const [activeTab, setActiveTab] = useState("new-order");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [scrolled, setScrolled] = useState(false);
  
  const [orders, setOrders] = useState<Order[]>([]);
  const liveCurrentOrder = editingOrder ? orders.find(o => o.id === editingOrder.id) : null;
  const orderToShow = liveCurrentOrder || editingOrder;
  const [users, setUsers] = useState<Record<string, { password: string; whatsapp: string; role?: string }>>({});
  const [currentUser, setCurrentUser] = useState<string | null>(localStorage.getItem("eli_embroidery_user"));
  const [searchName, setSearchName] = useState("");
  const [searchPassword, setSearchPassword] = useState("");

  // Form State
  const [customerName, setCustomerName] = useState("");
  const [orderType, setOrderType] = useState<"image" | "text">("image");
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [imageThumbnails, setImageThumbnails] = useState<string[]>([]);
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageThumbnail, setImageThumbnail] = useState<string | null>(null);
  const [textContent, setTextContent] = useState("");
  const [fontStyle, setFontStyle] = useState("");
  const [sizeDesired, setSizeDesired] = useState("");
  const [formatDesired, setFormatDesired] = useState("");
  const [deliveryDate, setDeliveryDate] = useState<Date | undefined>(undefined);
  const [notes, setNotes] = useState("");
  const [customerPassword, setCustomerPassword] = useState("");
  const [customerWhatsapp, setCustomerWhatsapp] = useState("");
  const [intent, setIntent] = useState<"budget" | "produce">("produce");
  const [firebaseUser, setFirebaseUser] = useState<any>(null);
  const [storageStatus, setStorageStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [storageErrorMessage, setStorageErrorMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [adminStatusFilter, setAdminStatusFilter] = useState("Pendente");
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  // Recovery State
  const [recoveryStep, setRecoveryStep] = useState<'none' | 'username' | 'whatsapp' | 'verify' | 'new_password'>('none');
  const [recoveryUsername, setRecoveryUsername] = useState("");
  const [recoveryWhatsappInput, setRecoveryWhatsappInput] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [recoveryStatus, setRecoveryStatus] = useState("");
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  // Auth and Storage initialization
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        signInAnonymously(auth).catch(err => {
          console.error("Anonymous auth error:", err);
          setStorageStatus('error');
          setStorageErrorMessage("Erro ao iniciar sessão anônima.");
        });
      } else {
        console.log("Authenticated as:", user.uid);
        // Test storage health
        try {
          const testRef = ref(storage, `health-check-${user.uid}.txt`);
          await uploadBytes(testRef, new Blob(['ok'], { type: 'text/plain' }));
          setStorageStatus('ok');
          setStorageErrorMessage(null);
        } catch (err: any) {
          console.error("Storage health check failed:", err);
          setStorageStatus('error');
          setStorageErrorMessage(err.message || "Erro de permissão no Storage.");
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch Data from Firebase
  useEffect(() => {
    setIsLoading(true);
    
    // Listen to orders
    const ordersQuery = query(collection(db, "orders"), orderBy("date", "desc"));
    const unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
      const ordersData = snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          ...data,
          id: docSnap.id,
          date: data.date ? new Date(data.date) : new Date(),
          deliveryDate: data.deliveryDate ? new Date(data.deliveryDate) : new Date()
        };
      }) as Order[];
      setOrders(ordersData);
      setIsLoading(false);
    }, (error) => {
      console.error("Error listening to orders:", error);
      setIsLoading(false);
    });

    // Listen to users
    const unsubscribeUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      const usersData: Record<string, any> = {};
      snapshot.docs.forEach(doc => {
        usersData[doc.id] = doc.data();
      });
      setUsers(usersData);
    });

    return () => {
      unsubscribeOrders();
      unsubscribeUsers();
    };
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const isAdmin = localStorage.getItem("eli_embroidery_admin");
    if (isAdmin === "true") {
      setIsAdminMode(true);
    }
  }, []);

  useEffect(() => {
    if (currentUser && users[currentUser] && !customerWhatsapp) {
      setCustomerWhatsapp(users[currentUser].whatsapp || "");
    }
  }, [currentUser, users]);

  const generateThumbnail = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 200;
          const MAX_HEIGHT = 200;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.6));
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setSelectedImages(prev => [...prev, ...files]);
      
      files.forEach(async (img) => {
        const file = img as File;
        const reader = new FileReader();
        reader.onloadend = () => {
          setImagePreviews(prev => [...prev, reader.result as string]);
        };
        reader.readAsDataURL(file);

        if (file.type.startsWith('image/')) {
          try {
            const thumb = await generateThumbnail(file);
            setImageThumbnails(prev => [...prev, thumb]);
          } catch (err) {
            console.error("Thumbnail error:", err);
            setImageThumbnails(prev => [...prev, ""]);
          }
        } else if (file.type === 'application/pdf') {
          setImageThumbnails(prev => [...prev, "pdf-placeholder"]);
        } else {
          setImageThumbnails(prev => [...prev, ""]);
        }
      });
    }
  };

  const removeImageAtIndex = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
    setImageThumbnails(prev => prev.filter((_, i) => i !== index));
  };

  const removeImage = () => {
    setSelectedImages([]);
    setImagePreviews([]);
    setImageThumbnails([]);
    setImage(null);
    setImagePreview(null);
    setImageThumbnail(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    console.log("handleSubmit called");
    e.preventDefault();
    
    // Validation check
    const isFormInvalid = (!currentUser && (!customerName || !customerPassword)) || 
                          !customerWhatsapp ||
                          (orderType === "image" && selectedImages.length === 0) || 
                          (orderType === "text" && (!textContent || !fontStyle)) || 
                          !sizeDesired || !formatDesired || !deliveryDate;

    if (isFormInvalid) {
      console.log("Validation failed", {
        customerName: !!customerName,
        customerPassword: !!customerPassword,
        customerWhatsapp: !!customerWhatsapp,
        images: selectedImages.length > 0,
        textContent: !!textContent,
        fontStyle: !!fontStyle,
        sizeDesired: !!sizeDesired,
        formatDesired: !!formatDesired,
        deliveryDate: !!deliveryDate
      });
      let missingFields = [];
      if (!currentUser && !customerName) missingFields.push("Seu Nome");
      if (!currentUser && !customerPassword) missingFields.push("Sua Senha");
      if (!customerWhatsapp) missingFields.push("Seu WhatsApp");
      if (orderType === "image" && selectedImages.length === 0) missingFields.push("Imagem do Bordado");
      if (orderType === "text" && !textContent) missingFields.push("Texto do Bordado");
      if (orderType === "text" && !fontStyle) missingFields.push("Estilo da Fonte");
      if (!sizeDesired) missingFields.push("Medida Desejada");
      if (!formatDesired) missingFields.push("Formato de Arquivo");
      if (!deliveryDate) missingFields.push("Data de Entrega");
      
      setFormError("Por favor, preencha os seguintes campos obrigatórios: " + missingFields.join(", "));
      // Scroll to error
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);
    setFormError(null);
    setSubmitStatus("Iniciando...");

    try {
      setSubmitStatus("Verificando cadastro...");
      if (!currentUser) {
        if (users[customerName]) {
          if (users[customerName].password !== customerPassword) {
            setFormError("Este nome já está em uso. Por favor, use a senha correta ou outro nome.");
            setIsSubmitting(false);
            setSubmitStatus("");
            return;
          }
        } else {
          // Create user in Firestore
          const userData = {
            username: customerName,
            password: customerPassword,
            whatsapp: customerWhatsapp,
            role: 'client'
          };
          const cleanUserData = JSON.parse(JSON.stringify(userData));
          await setDoc(doc(db, "users", customerName), cleanUserData);
        }
      } else if (currentUser && users[currentUser] && !users[currentUser].whatsapp && customerWhatsapp) {
        // Update user in Firestore
        await updateDoc(doc(db, "users", currentUser), {
          whatsapp: customerWhatsapp
        });
      }

      const nameToUse = currentUser || customerName;
      const whatsappToUse = customerWhatsapp || (currentUser && users[currentUser] ? users[currentUser].whatsapp : "");
      
      setSubmitStatus("Enviando pedido...");
      
      let orderImages: { preview: string, thumbnail: string | null, name: string }[] = [];

      if (selectedImages.length > 0) {
        for (let i = 0; i < selectedImages.length; i++) {
          const imgFile = selectedImages[i];
          const imgPreview = imagePreviews[i];
          const imgThumb = imageThumbnails[i];
          
          try {
            setSubmitStatus(`Enviando imagem ${i + 1} de ${selectedImages.length}...`);
            const storageRef = ref(storage, `orders/${Date.now()}-${imgFile.name}`);
            const uploadResult = await uploadBytes(storageRef, imgFile);
            const downloadUrl = await getDownloadURL(uploadResult.ref);
            
            orderImages.push({
              preview: downloadUrl,
              thumbnail: imgThumb === "pdf-placeholder" ? "pdf-placeholder" : downloadUrl, // simplified thumb for cloud
              name: imgFile.name
            });
          } catch (uploadErr) {
            console.error("Storage upload failed, using base64 fallback for one image.", uploadErr);
            if (imgFile.size < 800 * 1024) {
              orderImages.push({
                preview: imgPreview,
                thumbnail: imgThumb,
                name: imgFile.name
              });
            }
          }
        }
      }

      const newOrderData: any = {
        date: new Date().toISOString(),
        deliveryDate: deliveryDate ? deliveryDate.toISOString() : new Date().toISOString(),
        format: formatDesired,
        size: sizeDesired,
        status: "Pendente",
        intent: intent,
        orderType,
        customerName: nameToUse,
        imagePreview: orderImages.length > 0 ? orderImages[0].preview : null,
        imageThumbnail: orderImages.length > 0 ? orderImages[0].thumbnail : null,
        images: orderImages
      };

      if (orderType === "text") {
        if (textContent) newOrderData.textContent = textContent;
        if (fontStyle) newOrderData.fontStyle = fontStyle;
      }
      if (notes) newOrderData.notes = notes;
      if (whatsappToUse) newOrderData.customerWhatsapp = whatsappToUse;

      // Final safety check: remove any undefined or null values
      const cleanData: any = {};
      for (const key in newOrderData) {
        if (newOrderData[key] !== undefined && newOrderData[key] !== null) {
          cleanData[key] = newOrderData[key];
        }
      }

      setSubmitStatus("Salvando no banco...");
      const orderRef = await addDoc(collection(db, "orders"), cleanData);
      console.log("Order saved to Firestore:", orderRef.id);

      setCurrentUser(nameToUse);
      localStorage.setItem("eli_embroidery_user", nameToUse);
      setIsSubmitted(true);
    } catch (error: any) {
      console.error("Error submitting order:", error);
      const errorMsg = error.message || "Erro desconhecido";
      setFormError(`Erro ao enviar pedido: ${errorMsg}. Tente novamente.`);
    } finally {
      setIsSubmitting(false);
      setSubmitStatus("");
    }
  };

  const updateOrderStatus = async (orderId: string, newStatus: Order["status"]) => {
    try {
      await updateDoc(doc(db, "orders", orderId), {
        status: newStatus
      });
    } catch (error) {
      console.error("Error updating order status:", error);
      alert("Erro ao atualizar status do pedido.");
    }
  };

  const updateOrderIntent = async (orderId: string, newIntent: "budget" | "produce") => {
    try {
      await updateDoc(doc(db, "orders", orderId), {
        intent: newIntent
      });
    } catch (error) {
      console.error("Error updating order intent:", error);
      alert("Erro ao atualizar intenção do pedido.");
    }
  };

  const addOrderMatrixFile = async (orderId: string, file: File) => {
    try {
      setSubmitStatus("Enviando matriz para nuvem...");
      
      let fileUrl = "";
      let fileName = file.name;

      try {
        const storageRef = ref(storage, `matrices/${orderId}-${Date.now()}-${file.name}`);
        const uploadResult = await uploadBytes(storageRef, file);
        fileUrl = await getDownloadURL(uploadResult.ref);
        console.log("Matrix uploaded to Firebase Storage:", fileUrl);
      } catch (storageErr: any) {
        console.error("Firebase Storage upload failed:", storageErr);
        // We could use the local server fallback here if needed
        throw storageErr;
      }

      const orderRef = doc(db, "orders", orderId);
      const snapshot = await getDoc(orderRef);
      if (snapshot.exists()) {
        const data = snapshot.data() as Order;
        const currentFiles = data.matrixFiles || [];
        
        // Backward compatibility: if fileUrl exists but matrixFiles doesn't, we might want to preserve it
        // but for simplicity we'll just start the new array
        const updatedFiles = [...currentFiles, { url: fileUrl, name: fileName }];
        
        await updateDoc(orderRef, {
          matrixFiles: updatedFiles,
          status: 'Concluído',
          fileUrl: null,
          fileName: null,
          updatedAt: new Date().toISOString()
        });
      }

    } catch (error) {
      console.error("Error uploading matrix:", error);
      alert("Erro ao enviar o arquivo da matriz. Tente novamente ou use um arquivo menor.");
    } finally {
      setSubmitStatus("");
    }
  };

  const removeOrderMatrixFile = async (orderId: string, index: number, isLegacy: boolean = false) => {
    console.log("DEBUG: removeOrderMatrixFile called with:", { orderId, index, isLegacy });
    
    if (!orderId) {
      alert("Erro: ID do pedido não encontrado.");
      return;
    }

    if (!window.confirm("Você tem certeza que deseja excluir permanentemente este arquivo de matriz?")) {
      return;
    }
    
    try {
      setSubmitStatus("Removendo arquivo...");
      const orderRef = doc(db, "orders", orderId);
      
      console.log("DEBUG: Fetching latest order data from server...");
      const snapshot = await getDoc(orderRef);
      
      if (!snapshot.exists()) {
        throw new Error("O pedido não existe mais no banco de dados.");
      }

      const data = snapshot.data() as Order;
      console.log("DEBUG: Current order data:", data);
      
      // 1. Storage Cleanup (Tentativa)
      const fileUrlToDelete = isLegacy ? (data.fileUrl || "") : (data.matrixFiles?.[index]?.url || "");
      if (fileUrlToDelete && fileUrlToDelete.includes("firebase")) {
        try {
          console.log("DEBUG: Attempting to delete from Storage:", fileUrlToDelete);
          await deleteObject(ref(storage, fileUrlToDelete));
          console.log("DEBUG: Storage deletion success");
        } catch (e) {
          console.warn("DEBUG: Storage deletion failed (expected if file was already moved/deleted):", e);
        }
      }

      // 2. Database Update
      const updateData: any = {
        updatedAt: new Date().toISOString()
      };

      if (isLegacy) {
        updateData.fileUrl = deleteField();
        updateData.fileName = deleteField();
      } else {
        const currentFiles = data.matrixFiles || [];
        console.log("DEBUG: Current files count:", currentFiles.length);
        const updatedFiles = currentFiles.filter((_: any, i: number) => i !== index);
        console.log("DEBUG: New files count:", updatedFiles.length);
        updateData.matrixFiles = updatedFiles;
        // Always try to clean legacy fields
        updateData.fileUrl = deleteField();
        updateData.fileName = deleteField();
      }

      console.log("DEBUG: Sending update to Firestore:", updateData);
      await updateDoc(orderRef, updateData);
      console.log("DEBUG: Firestore update success!");
      
      setSubmitStatus("");
      alert("Arquivo excluído com sucesso!");
    } catch (error: any) {
      console.error("DEBUG: CRITICAL ERROR in removeOrderMatrixFile:", error);
      alert(`Erro crítico ao excluir: ${error.message}`);
      setSubmitStatus("");
    }
  };

  const deleteOrder = async (orderId: string) => {
    if (!window.confirm("Tem certeza que deseja excluir este pedido e todos os seus arquivos permanentemente?")) return;
    
    try {
      setSubmitStatus("Excluindo pedido...");
      const orderRef = doc(db, "orders", orderId);
      const snapshot = await getDoc(orderRef);
      
      if (snapshot.exists()) {
        const data = snapshot.data() as Order;
        
        // Cleanup Files
        const urls = [...(data.matrixFiles || []).map(f => f.url)];
        if (data.fileUrl) urls.push(data.fileUrl);
        
        for (const url of urls) {
          if (url && url.includes("firebase")) {
            try { await deleteObject(ref(storage, url)); } catch (e) { console.warn("Storage cleanup failed for:", url); }
          }
        }
      }
      
      await deleteDoc(orderRef);
      setSubmitStatus("");
    } catch (error) {
      console.error("Error deleting order:", error);
      alert("Erro ao excluir pedido.");
      setSubmitStatus("");
    }
  };

  const handleViewImage = (imageUrl: string) => {
    if (!imageUrl || imageUrl === "pdf-placeholder") return;
    setViewingImage(imageUrl);
  };

  const downloadFile = async (url: string, fileName: string) => {
    try {
      setSubmitStatus(`Iniciando download...`);
      // Use proxy for external URLs to avoid CORS issues with Blob fetch
      const finalUrl = url.startsWith('http') ? `/api/proxy-image?url=${encodeURIComponent(url)}` : url;
      
      const response = await fetch(finalUrl);
      if (!response.ok) throw new Error("Download failed");
      
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
      setSubmitStatus("");
    } catch (error) {
      console.error("Download failed:", error);
      // Fallback: just open in new tab
      window.open(url, '_blank');
      setSubmitStatus("");
    }
  };

  const copyImageToClipboard = async (imageUrl: string) => {
    try {
      let blob: Blob;
      
      if (imageUrl.startsWith('data:')) {
        // Handle base64 directly
        const response = await fetch(imageUrl);
        blob = await response.blob();
      } else {
        // Use proxy to avoid CORS issues with Firebase Storage
        const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error("Proxy fetch failed");
        blob = await response.blob();
      }
      
      const item = new ClipboardItem({ [blob.type]: blob });
      await navigator.clipboard.write([item]);
      alert("Imagem copiada para a área de transferência!");
    } catch (err) {
      console.error("Failed to copy image: ", err);
      // Fallback for browsers that don't support ClipboardItem or if fetch fails
      const link = document.createElement('a');
      link.href = imageUrl;
      link.target = '_blank';
      link.click();
      alert("Não foi possível copiar diretamente. A imagem foi aberta em uma nova aba para você copiar manualmente.");
    }
  };

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPassword === "eli2026") {
      setIsAdminMode(true);
      setShowAdminLogin(false);
      setAdminPassword("");
      setActiveTab("admin");
      localStorage.setItem("eli_embroidery_admin", "true");
    } else {
      alert("Senha incorreta!");
    }
  };

  const handleLogout = () => {
    setIsAdminMode(false);
    localStorage.removeItem("eli_embroidery_admin");
    setActiveTab("new-order");
  };

  const handleCustomerLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (users[searchName]) {
      if (users[searchName].password === searchPassword) {
        setCurrentUser(searchName);
        localStorage.setItem("eli_embroidery_user", searchName);
        setSearchName("");
        setSearchPassword("");
      } else {
        alert("Senha incorreta!");
      }
    } else {
      alert("Usuário não encontrado!");
    }
  };

  const handleStartRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError(null);
    
    const cleanWhatsapp = recoveryWhatsappInput.replace(/\D/g, "");
    if (!cleanWhatsapp) {
      setRecoveryError("Por favor, digite seu número de WhatsApp.");
      return;
    }

    setRecoveryStatus("Localizando conta...");

    // More precise check: clean everything and compare
    const findUser = async () => {
      let currentUsers = { ...users };
      
      // Fallback: Check localStorage too
      const localUsersStr = localStorage.getItem("elibords_users");
      if (localUsersStr) {
        try {
          const localUsers = JSON.parse(localUsersStr);
          currentUsers = { ...localUsers, ...currentUsers };
        } catch (e) {}
      }

      // If still empty or as backup, try manual firestore fetch
      if (Object.keys(currentUsers).length === 0) {
        try {
          const { getDocs, collection, query, limit } = await import("firebase/firestore");
          // Fetch all users once
          const snapshot = await getDocs(collection(db, "users"));
          if (snapshot.empty) {
            console.warn("Nenhum usuário encontrado no Firestore 'users'");
          }
          snapshot.docs.forEach(doc => {
            currentUsers[doc.id] = doc.data() as any;
          });
          setUsers(currentUsers);
        } catch (err: any) {
          console.error("Erro ao carregar usuários manualmente:", err);
          throw new Error(`Erro ao conectar ao banco de dados: ${err.message}`);
        }
      }

      const input = cleanWhatsapp;
      console.log("Buscando WhatsApp:", input, "em", Object.keys(currentUsers).length, "usuários");

      // Debugging: Log first 3 users keys
      console.log("Amostra de usuários:", Object.keys(currentUsers).slice(0, 3));

      for (const [name, data] of (Object.entries(currentUsers) as [string, any][])) {
        const stored = ((data.whatsapp as string) || "").replace(/\D/g, "");
        if (!stored) continue;

        // 1. Exact match
        if (stored === input) return { name, whatsapp: data.whatsapp };

        // 2. Multi-length matching (handles 9-digit diff and 55 prefix)
        // Check if one is a suffix of the other (at least 8 digits)
        const minMatch = 8;
        if (stored.length >= minMatch && input.length >= minMatch) {
          const sSuffix = stored.slice(-minMatch);
          const iSuffix = input.slice(-minMatch);
          if (sSuffix === iSuffix) return { name, whatsapp: data.whatsapp };
        }
        
        // 3. Contains (handles 55 prefix or DDD missing)
        if (stored.length >= 7 && input.length >= 7) {
          if (stored.includes(input) || input.includes(stored)) return { name, whatsapp: data.whatsapp };
        }
      }
      return null;
    };

    const found = await findUser();

    if (!found) {
      setRecoveryError("Nenhum usuário encontrado com este WhatsApp. Verifique o número ou entre em contato.");
      setRecoveryStatus("");
      return;
    }

    setRecoveryUsername(found.name);
    const whatsappToUse = found.whatsapp;

    setRecoveryStatus("Enviando código...");
    try {
      const res = await fetch("/api/recovery/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsapp: whatsappToUse, username: found.name })
      });
      
      const contentType = res.headers.get("content-type");
      if (!res.ok) {
        const errorText = await res.text();
        console.error("Server error response:", errorText);
        throw new Error(`Erro no servidor (${res.status}): ${errorText.slice(0, 50)}`);
      }

      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("Non-JSON response received:", text);
        throw new Error("O servidor retornou uma resposta inválida (não-JSON).");
      }

      const data = await res.json();
      if (data.success) {
        setRecoveryStep('verify');
        if (data.devCode) {
          setRecoveryStatus(`MODO TESTE: Digite ${data.devCode} na próxima tela.`);
        } else {
          setRecoveryStatus("");
        }
      } else {
        setRecoveryError(data.error || "Erro ao enviar código.");
        setRecoveryStatus("");
      }
    } catch (err: any) {
      console.error("Recovery Fetch Error:", err);
      setRecoveryError(`Falha na conexão: ${err.message || 'Erro desconhecido'}`);
      setRecoveryStatus("");
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError(null);
    setRecoveryStatus("Verificando...");
    try {
      const res = await fetch("/api/recovery/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: recoveryUsername, code: recoveryCode })
      });
      const data = await res.json();
      if (data.success) {
        setRecoveryStep('new_password');
        setRecoveryStatus("");
      } else {
        setRecoveryError(data.error || "Código inválido.");
        setRecoveryStatus("");
      }
    } catch (err) {
      setRecoveryError("Falha na conexão.");
      setRecoveryStatus("");
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError(null);
    if (!newPassword) {
      setRecoveryError("Digite a nova senha.");
      return;
    }

    try {
      setRecoveryStatus("Atualizando senha...");
      await updateDoc(doc(db, "users", recoveryUsername), {
        password: newPassword
      });
      setRecoveryStatus("Senha atualizada com sucesso!");
      setTimeout(() => {
        setRecoveryStep('none');
        setSearchPassword(newPassword);
        setSearchName(recoveryUsername);
        setRecoveryUsername("");
        setNewPassword("");
        setRecoveryCode("");
        setRecoveryStatus("");
      }, 2000);
    } catch (err) {
      setRecoveryError("Erro ao salvar nova senha.");
      setRecoveryStatus("");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-light">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-brand-dark/60 font-medium">Carregando dados...</p>
        </div>
      </div>
    );
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-brand-light opacity-50" />
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="relative z-10 w-full max-w-md"
        >
          <Card className="glass-card text-center py-12 md:py-16 px-6 md:px-10">
            <div className="w-16 h-16 md:w-24 md:h-24 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6 md:mb-8 border border-emerald-500/20">
              <CheckCircle2 className="w-8 h-8 md:w-12 md:h-12 text-emerald-500" />
            </div>
            <CardTitle className="text-2xl md:text-4xl font-display tracking-tight text-brand-dark mb-4">Pedido Recebido!</CardTitle>
            <CardDescription className="text-base md:text-lg text-brand-dark/60 mb-8 md:mb-10 leading-relaxed">
              Obrigado, <span className="text-brand-primary font-bold">{currentUser}</span>! Seu pedido foi enviado com sucesso e já está em nossa fila de produção.
            </CardDescription>
            <Button 
              onClick={() => {
                setIsSubmitted(false);
                setCustomerName("");
                setOrderType("image");
                setImage(null);
                setImagePreview(null);
                setActiveTab("my-orders");
              }}
              className="vibrant-button w-full h-12 md:h-14 text-base md:text-lg"
            >
              Ver Meus Pedidos
            </Button>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-light text-brand-dark selection:bg-brand-primary/20 selection:text-brand-primary">
      {/* Header */}
      <header className={`sticky top-0 z-50 w-full transition-all duration-300 ${
        scrolled 
          ? "bg-brand-light/90 backdrop-blur-lg border-b border-brand-primary/10 shadow-sm py-2" 
          : "bg-transparent py-4"
      }`}>
        <div className="container mx-auto px-4 md:px-6 h-16 md:h-20 flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-4 group cursor-pointer" onClick={() => setActiveTab("new-order")}>
            <div className="w-10 h-10 md:w-14 md:h-14 bg-[#fdf8f3] rounded-lg md:rounded-xl flex items-center justify-center shadow-lg shadow-brand-primary/5 group-hover:scale-110 transition-transform border border-dashed border-[#3d2b1f]/20 relative overflow-hidden">
              <span className="text-[#3d2b1f] text-lg md:text-2xl font-serif font-black italic select-none tracking-tighter relative z-10">EB</span>
            </div>
            <div>
              <h1 className="text-lg md:text-2xl font-display font-bold tracking-tight">EliBord's</h1>
              <p className="text-[8px] md:text-[10px] uppercase tracking-[0.2em] md:tracking-[0.3em] font-bold text-brand-primary opacity-60">matrizes computadorizadas</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isAdminMode ? (
              <Button 
                variant="ghost" 
                size="icon"
                onClick={handleLogout}
                className="text-brand-dark/20 hover:text-brand-primary hover:bg-brand-primary/5 h-10 w-10 rounded-xl transition-colors"
              >
                <LogOut className="w-5 h-5" />
              </Button>
            ) : (
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setShowAdminLogin(true)}
                className="text-brand-dark/10 hover:text-brand-primary/40 hover:bg-brand-primary/5 h-10 w-10 rounded-xl transition-colors"
              >
                <Settings className="w-5 h-5" />
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 md:px-6 py-8 md:py-12 max-w-6xl">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8 md:space-y-12">
          <div className="flex justify-center">
            <TabsList className="bg-brand-primary/5 p-1 md:p-1.5 rounded-xl md:rounded-2xl h-12 md:h-16 border border-brand-primary/10 w-full md:w-auto overflow-x-auto no-scrollbar justify-start md:justify-center">
              <TabsTrigger value="new-order" className="rounded-lg md:rounded-xl px-4 md:px-8 h-full data-[state=active]:bg-white data-[state=active]:text-brand-primary data-[state=active]:shadow-sm font-bold md:font-medium transition-all text-xs md:text-base flex-shrink-0">
                <PlusCircle className="w-4 h-4 mr-2 hidden sm:inline" /> Novo Pedido
              </TabsTrigger>
              <TabsTrigger value="my-orders" className="rounded-lg md:rounded-xl px-4 md:px-8 h-full data-[state=active]:bg-white data-[state=active]:text-brand-primary data-[state=active]:shadow-sm font-bold md:font-medium transition-all text-xs md:text-base flex-shrink-0">
                <History className="w-4 h-4 mr-2 hidden sm:inline" /> Meus Pedidos
              </TabsTrigger>
              {isAdminMode && (
                <TabsTrigger value="admin" className="rounded-lg md:rounded-xl px-4 md:px-8 h-full data-[state=active]:bg-brand-primary data-[state=active]:text-white data-[state=active]:shadow-lg font-bold md:font-medium transition-all text-xs md:text-base flex-shrink-0">
                  <Settings className="w-4 h-4 mr-2 hidden sm:inline" /> Gerenciar
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          <AnimatePresence mode="wait">
            <TabsContent value="new-order" key="new-order">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-3xl mx-auto"
              >
                <Card className="glass-card overflow-hidden">
                  <CardHeader className="p-6 md:p-10 text-center border-b border-brand-primary/10 bg-brand-primary/5">
                    <CardTitle className="text-2xl md:text-4xl font-display tracking-tight text-brand-dark mb-3">Solicitar Matriz</CardTitle>
                    <CardDescription className="text-base md:text-lg text-brand-dark/50">Preencha os detalhes do seu bordado personalizado</CardDescription>
                    {formError && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="mt-6 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-sm font-bold flex items-center gap-3 justify-center"
                      >
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        {formError}
                      </motion.div>
                    )}
                  </CardHeader>
                  <form onSubmit={handleSubmit}>
                    <CardContent className="p-6 md:p-10 space-y-6 md:space-y-10">
                      {/* Customer Info */}
                      {!currentUser ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div className="space-y-4">
                            <Label className="text-[10px] uppercase tracking-[0.2em] font-bold text-brand-primary">Seu Nome</Label>
                            <Input 
                              placeholder="Ex: Maria Silva" 
                              value={customerName}
                              onChange={(e) => setCustomerName(e.target.value)}
                              className="glass-input h-14 text-lg"
                            />
                          </div>
                          <div className="space-y-4">
                            <Label className="text-[10px] uppercase tracking-[0.2em] font-bold text-brand-primary">Sua Senha (para acompanhar)</Label>
                            <Input 
                              type="password"
                              placeholder="Crie uma senha simples" 
                              value={customerPassword}
                              onChange={(e) => setCustomerPassword(e.target.value)}
                              className="glass-input h-14 text-lg"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col md:flex-row md:items-center justify-between p-4 md:p-6 bg-brand-primary/5 rounded-2xl border border-brand-primary/10 gap-4 mb-8">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 md:w-12 md:h-12 bg-brand-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                              <CheckCircle2 className="w-5 h-5 md:w-6 md:h-6 text-brand-primary" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-[10px] md:text-sm text-brand-dark/50 uppercase tracking-widest font-bold">Pedido para</p>
                              <p className="text-lg md:text-xl font-bold text-brand-dark truncate">{currentUser}</p>
                            </div>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => {
                              setCurrentUser(null);
                              localStorage.removeItem("eli_embroidery_user");
                            }}
                            className="text-brand-primary hover:bg-brand-primary/10 w-full md:w-auto h-10"
                          >
                            Trocar Usuário
                          </Button>
                        </div>
                      )}

                      <div className="space-y-4">
                        <Label className="text-[10px] uppercase tracking-[0.2em] font-bold text-brand-primary">Seu WhatsApp</Label>
                        <Input 
                          placeholder="Ex: (11) 99999-9999" 
                          value={customerWhatsapp}
                          onChange={(e) => setCustomerWhatsapp(e.target.value)}
                          className="glass-input h-14 text-lg"
                        />
                      </div>

                      <div className="space-y-6">
                        <Label className="text-[10px] uppercase tracking-[0.2em] font-bold text-brand-primary">O que você deseja fazer?</Label>
                        <RadioGroup value={intent} onValueChange={(v: any) => setIntent(v)} className="grid grid-cols-2 gap-4">
                          <div className={cn(
                            "relative flex items-center justify-center p-6 rounded-2xl border-2 cursor-pointer transition-all",
                            intent === "budget" ? "border-brand-primary bg-brand-primary/5" : "border-brand-primary/10 hover:border-brand-primary/30"
                          )} onClick={() => setIntent("budget")}>
                            <RadioGroupItem value="budget" id="budget" className="sr-only" />
                            <div className="flex flex-col items-center gap-3">
                              <div className={cn("w-8 h-8 rounded-full flex items-center justify-center border-2", intent === "budget" ? "border-brand-primary text-brand-primary" : "border-brand-dark/20 text-brand-dark/20")}>
                                <span className="text-xs font-bold">$</span>
                              </div>
                              <span className={cn("font-bold text-sm uppercase tracking-wider", intent === "budget" ? "text-brand-primary" : "text-brand-dark/30")}>Orçamento</span>
                            </div>
                          </div>
                          <div className={cn(
                            "relative flex items-center justify-center p-6 rounded-2xl border-2 cursor-pointer transition-all",
                            intent === "produce" ? "border-brand-primary bg-brand-primary/5" : "border-brand-primary/10 hover:border-brand-primary/30"
                          )} onClick={() => setIntent("produce")}>
                            <RadioGroupItem value="produce" id="produce" className="sr-only" />
                            <div className="flex flex-col items-center gap-3">
                              <CheckCircle2 className={cn("w-8 h-8", intent === "produce" ? "text-brand-primary" : "text-brand-dark/30")} />
                              <span className={cn("font-bold text-sm uppercase tracking-wider", intent === "produce" ? "text-brand-primary" : "text-brand-dark/30")}>Produzir</span>
                            </div>
                          </div>
                        </RadioGroup>
                      </div>

                      <div className="space-y-6">
                        <Label className="text-[10px] uppercase tracking-[0.2em] font-bold text-brand-primary">O que você deseja bordar?</Label>
                        <RadioGroup value={orderType} onValueChange={(v: any) => setOrderType(v)} className="grid grid-cols-2 gap-4">
                          <div className={cn(
                            "relative flex items-center justify-center p-6 rounded-2xl border-2 cursor-pointer transition-all",
                            orderType === "image" ? "border-brand-primary bg-brand-primary/5" : "border-brand-primary/10 hover:border-brand-primary/30"
                          )} onClick={() => setOrderType("image")}>
                            <RadioGroupItem value="image" id="image" className="sr-only" />
                            <div className="flex flex-col items-center gap-3">
                              <ImageFormIcon className={cn("w-8 h-8", orderType === "image" ? "text-brand-primary" : "text-brand-dark/30")} />
                              <span className={cn("font-bold text-sm uppercase tracking-wider", orderType === "image" ? "text-brand-primary" : "text-brand-dark/30")}>Imagem / Logo</span>
                            </div>
                          </div>
                          <div className={cn(
                            "relative flex items-center justify-center p-6 rounded-2xl border-2 cursor-pointer transition-all",
                            orderType === "text" ? "border-brand-primary bg-brand-primary/5" : "border-brand-primary/10 hover:border-brand-primary/30"
                          )} onClick={() => setOrderType("text")}>
                            <RadioGroupItem value="text" id="text" className="sr-only" />
                            <div className="flex flex-col items-center gap-3">
                              <Type className={cn("w-8 h-8", orderType === "text" ? "text-brand-primary" : "text-brand-dark/30")} />
                              <span className={cn("font-bold text-sm uppercase tracking-wider", orderType === "text" ? "text-brand-primary" : "text-brand-dark/30")}>Apenas Texto</span>
                            </div>
                          </div>
                        </RadioGroup>
                      </div>

                      <AnimatePresence mode="wait">
                        {orderType === "image" ? (
                          <motion.div
                            key="image-upload"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="space-y-4 overflow-hidden"
                          >
                            <div className="space-y-4">
                              {imagePreviews.length > 0 ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                  {imagePreviews.map((preview, index) => (
                                    <motion.div 
                                      initial={{ opacity: 0, scale: 0.9 }}
                                      animate={{ opacity: 1, scale: 1 }}
                                      key={index} 
                                      className="relative aspect-square rounded-2xl border border-brand-primary/10 overflow-hidden bg-brand-primary/5 group"
                                    >
                                      {imageThumbnails[index] === "pdf-placeholder" ? (
                                        <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-2">
                                          <FileType className="w-8 h-8 text-brand-primary opacity-40" />
                                          <span className="text-[8px] font-bold text-brand-dark/40 uppercase truncate w-full text-center px-1">
                                            {selectedImages[index]?.name}
                                          </span>
                                        </div>
                                      ) : (
                                        <img 
                                          src={preview} 
                                          className="w-full h-full object-cover" 
                                          referrerPolicy="no-referrer" 
                                        />
                                      )}
                                      <div className="absolute inset-0 bg-brand-dark/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                        <Button 
                                          type="button" 
                                          variant="ghost" 
                                          size="icon" 
                                          onClick={() => handleViewImage(preview)}
                                          className="h-8 w-8 rounded-full bg-white/20 text-white hover:bg-white/40"
                                        >
                                          <Maximize2 className="w-4 h-4" />
                                        </Button>
                                        <Button 
                                          type="button" 
                                          variant="destructive" 
                                          size="icon" 
                                          onClick={() => removeImageAtIndex(index)}
                                          className="h-8 w-8 rounded-full shadow-lg"
                                        >
                                          <X className="w-4 h-4" />
                                        </Button>
                                      </div>
                                    </motion.div>
                                  ))}
                                  <div className="relative group border-2 border-dashed border-brand-primary/20 rounded-2xl aspect-square flex flex-col items-center justify-center text-center hover:border-brand-primary/40 hover:bg-brand-primary/5 transition-all cursor-pointer">
                                    <PlusCircle className="w-8 h-8 text-brand-primary opacity-40 group-hover:opacity-100 transition-opacity mb-2" />
                                    <span className="text-[10px] font-bold text-brand-primary uppercase tracking-widest opacity-40 group-hover:opacity-100 transition-opacity px-2">
                                      Mais Fotos
                                    </span>
                                    <input 
                                      type="file" 
                                      multiple
                                      className="absolute inset-0 opacity-0 cursor-pointer" 
                                      onChange={handleImageChange}
                                      accept="image/*,.pdf"
                                    />
                                  </div>
                                </div>
                              ) : (
                                <div className={cn(
                                  "relative group border-2 border-dashed rounded-3xl p-6 md:p-12 transition-all flex flex-col items-center justify-center text-center min-h-[250px] md:min-h-[300px]",
                                  "border-brand-primary/10 hover:border-brand-primary/30 hover:bg-brand-primary/5"
                                )}>
                                  <div className="w-20 h-20 bg-brand-primary/5 rounded-full flex items-center justify-center mb-6 border border-brand-primary/10">
                                    <Upload className="w-10 h-10 text-brand-primary" />
                                  </div>
                                  <div className="space-y-2">
                                    <p className="font-semibold text-lg text-brand-dark">Clique ou arraste suas fotos</p>
                                    <p className="text-sm text-brand-dark/40 italic">PNG, JPG, SVG ou PDF até 10MB</p>
                                  </div>
                                  <input 
                                    type="file" 
                                    multiple
                                    ref={fileInputRef}
                                    className="absolute inset-0 opacity-0 cursor-pointer z-0" 
                                    onChange={handleImageChange}
                                    accept="image/*,.pdf"
                                  />
                                </div>
                              )}
                            </div>
                          </motion.div>
                        ) : (
                          <motion.div
                            key="text-fields"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="space-y-8 overflow-hidden"
                          >
                            <div className="space-y-4">
                              <Label className="text-[10px] uppercase tracking-[0.2em] font-bold text-brand-primary">Texto para Bordar</Label>
                              <Input 
                                placeholder="Digite o nome ou frase" 
                                value={textContent}
                                onChange={(e) => setTextContent(e.target.value)}
                                className="glass-input h-14 text-xl font-medium"
                              />
                            </div>
                            <div className="space-y-4">
                              <Label className="text-[10px] uppercase tracking-[0.2em] font-bold text-brand-primary">Nome da Fonte</Label>
                              <Input 
                                placeholder="Ex: Arial, Script, Times New Roman..." 
                                value={fontStyle}
                                onChange={(e) => setFontStyle(e.target.value)}
                                className="glass-input h-14 text-xl font-medium"
                              />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Size Section */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                          <Label className="text-[10px] uppercase tracking-[0.2em] font-bold text-brand-primary flex items-center gap-2">
                            <Maximize2 className="w-3 h-3" /> Medida Desejada
                          </Label>
                          <Input 
                            type="text"
                            inputMode="numeric"
                            placeholder="Ex: 10" 
                            value={sizeDesired}
                            onChange={(e) => setSizeDesired(e.target.value.replace(/[^0-9]/g, ''))}
                            className="glass-input h-12"
                          />
                          <p className="text-[9px] text-brand-primary/60 font-medium uppercase tracking-wider">Informe apenas o número (ex: 10 para 10cm)</p>
                        </div>

                        <div className="space-y-4">
                          <Label className="text-[10px] uppercase tracking-[0.2em] font-bold text-brand-primary flex items-center gap-2">
                            <FileType className="w-3 h-3" /> Formato de Arquivo
                          </Label>
                          <Select value={formatDesired} onValueChange={setFormatDesired}>
                            <SelectTrigger className="glass-input h-12">
                              <SelectValue placeholder="Selecione o formato" />
                            </SelectTrigger>
                            <SelectContent className="bg-brand-light border-brand-primary/10 text-brand-dark">
                              {EMBROIDERY_FORMATS.map((f) => (
                                <SelectItem key={f} value={f}>{f}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Date Section */}
                      <div className="space-y-4">
                        <Label className="text-[10px] uppercase tracking-[0.2em] font-bold text-brand-primary flex items-center gap-2">
                          <CalendarIcon className="w-3 h-3" /> Data de Entrega Desejada
                        </Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant={"outline"}
                              className={cn(
                                "glass-input w-full h-12 justify-start text-left font-normal",
                                !deliveryDate && "text-brand-dark/30"
                              )}
                            >
                              <CalendarIcon className="mr-3 h-4 w-4 text-brand-primary" />
                              {deliveryDate ? format(deliveryDate, "PPP", { locale: ptBR }) : <span>Selecione uma data</span>}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 bg-brand-light border-brand-primary/10" align="start">
                            <Calendar
                              mode="single"
                              selected={deliveryDate}
                              onSelect={setDeliveryDate}
                              initialFocus
                              disabled={(date) => {
                                const today = new Date();
                                today.setHours(0, 0, 0, 0);
                                return date < today;
                              }}
                              locale={ptBR}
                              className="text-brand-dark"
                            />
                          </PopoverContent>
                        </Popover>
                      </div>

                      {/* Notes */}
                      <div className="space-y-4">
                        <Label className="text-[10px] uppercase tracking-[0.2em] font-bold text-brand-primary flex items-center gap-2">
                          <Info className="w-3 h-3" /> Observações Adicionais
                        </Label>
                        <textarea 
                          className="glass-input w-full min-h-[120px] p-5 focus:outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all resize-none"
                          placeholder="Ex: Cores específicas, tipo de tecido, etc."
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                        />
                      </div>
                    </CardContent>

                    <CardFooter className="p-6 md:p-10 bg-brand-primary/5 border-t border-brand-primary/10 flex flex-col gap-4">
                      <Button 
                        type="submit" 
                        className="vibrant-button w-full h-14 md:h-16 text-lg md:text-xl group"
                        disabled={isSubmitted || isSubmitting}
                      >
                        {isSubmitting ? (submitStatus || "Enviando...") : "Finalizar Pedido"}
                        {!isSubmitting && <ArrowRight className="ml-3 w-6 h-6 group-hover:translate-x-2 transition-transform" />}
                      </Button>
                      
                      {(!isSubmitted && !isSubmitting) && (
                        <div className="text-center">
                          {(!currentUser && (!customerName || !customerPassword)) ? (
                            <p className="text-[10px] text-amber-600 font-medium uppercase tracking-wider">Preencha seu nome e senha para continuar</p>
                          ) : !customerWhatsapp ? (
                            <p className="text-[10px] text-amber-600 font-medium uppercase tracking-wider">O WhatsApp é obrigatório</p>
                          ) : (orderType === "image" && !image) ? (
                            <p className="text-[10px] text-amber-600 font-medium uppercase tracking-wider">Selecione uma imagem para o bordado</p>
                          ) : (orderType === "text" && (!textContent || !fontStyle)) ? (
                            <p className="text-[10px] text-amber-600 font-medium uppercase tracking-wider">Preencha o texto e o estilo da fonte</p>
                          ) : !sizeDesired ? (
                            <p className="text-[10px] text-amber-600 font-medium uppercase tracking-wider">Informe a medida desejada</p>
                          ) : !formatDesired ? (
                            <p className="text-[10px] text-amber-600 font-medium uppercase tracking-wider">Selecione o formato do arquivo</p>
                          ) : !deliveryDate ? (
                            <p className="text-[10px] text-amber-600 font-medium uppercase tracking-wider">Selecione uma data de entrega</p>
                          ) : null}
                        </div>
                      )}
                    </CardFooter>
                  </form>
                </Card>
              </motion.div>
            </TabsContent>

            <TabsContent value="my-orders" key="my-orders">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                {!currentUser ? (
                  <Card className="glass-card max-w-md mx-auto">
                    <CardHeader className="text-center pt-12">
                      <div className="w-20 h-20 bg-brand-primary/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-brand-primary/10">
                        <History className="w-10 h-10 text-brand-primary" />
                      </div>
                      <CardTitle className="text-3xl font-display tracking-tight text-brand-dark">Acompanhar Pedidos</CardTitle>
                      <CardDescription className="text-brand-dark/50">Digite seus dados de acesso</CardDescription>
                    </CardHeader>
                    {recoveryStep === 'none' ? (
                      <form onSubmit={handleCustomerLogin}>
                        <CardContent className="space-y-6 p-10">
                          <div className="space-y-2">
                            <Label className="text-[10px] uppercase tracking-[0.2em] font-bold text-brand-primary">Seu Nome</Label>
                            <Input 
                              placeholder="Ex: Maria Silva" 
                              value={searchName}
                              onChange={(e) => setSearchName(e.target.value)}
                              className="glass-input h-14 text-lg"
                            />
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <Label className="text-[10px] uppercase tracking-[0.2em] font-bold text-brand-primary">Sua Senha</Label>
                              <button 
                                type="button" 
                                onClick={() => {
                                  setRecoveryStep('username');
                                  setRecoveryWhatsappInput("");
                                  setRecoveryUsername("");
                                }}
                                className="text-[10px] text-brand-primary font-bold uppercase hover:underline"
                              >
                                Esqueci a senha
                              </button>
                            </div>
                            <Input 
                              type="password"
                              placeholder="Digite sua senha" 
                              value={searchPassword}
                              onChange={(e) => setSearchPassword(e.target.value)}
                              className="glass-input h-14 text-lg"
                            />
                          </div>
                        </CardContent>
                        <CardFooter className="p-6 md:p-10 bg-brand-primary/5 border-t border-brand-primary/10">
                          <Button type="submit" className="vibrant-button w-full h-12 md:h-14 text-base md:text-lg">
                            Entrar e Ver Pedidos
                          </Button>
                        </CardFooter>
                      </form>
                    ) : (
                      <div className="p-10 space-y-6">
                        {recoveryStep === 'username' && (
                          <form onSubmit={handleStartRecovery} className="space-y-6">
                            <div className="space-y-4">
                              <Label className="text-[10px] uppercase tracking-[0.2em] font-bold text-brand-primary">Confirmar WhatsApp</Label>
                              <Input 
                                placeholder="Seu WhatsApp (apenas números)" 
                                value={recoveryWhatsappInput}
                                onChange={(e) => setRecoveryWhatsappInput(e.target.value)}
                                className="glass-input h-14"
                              />
                              <p className="text-[10px] text-brand-dark/40 italic">
                                Usaremos este número para localizar sua conta e enviar o código.
                              </p>
                            </div>
                            {recoveryError && <p className="text-red-500 text-xs font-bold uppercase">{recoveryError}</p>}
                            {recoveryStatus && <p className="text-brand-primary text-xs font-bold uppercase">{recoveryStatus}</p>}
                            <div className="flex gap-2">
                              <Button variant="ghost" className="flex-1" onClick={() => setRecoveryStep('none')}>Cancelar</Button>
                              <Button type="submit" className="vibrant-button flex-1" disabled={recoveryStatus === "Enviando código..."}>Receber Código</Button>
                            </div>
                          </form>
                        )}

                        {recoveryStep === 'verify' && (
                          <form onSubmit={handleVerifyCode} className="space-y-6">
                            <div className="text-center space-y-2">
                              <p className="text-sm font-medium text-brand-dark">Confirmando sua identidade para {recoveryUsername}</p>
                            </div>
                            <div className="space-y-4">
                              <Label className="text-[10px] uppercase tracking-[0.2em] font-bold text-brand-primary text-center block">Código de Verificação</Label>
                              <Input 
                                placeholder="000000" 
                                value={recoveryCode}
                                onChange={(e) => setRecoveryCode(e.target.value)}
                                className="glass-input h-16 text-center text-3xl font-bold tracking-[0.5em]"
                                maxLength={6}
                              />
                            </div>
                            {recoveryError && <p className="text-red-500 text-xs font-bold uppercase text-center">{recoveryError}</p>}
                            {recoveryStatus && <p className="text-brand-primary text-xs font-bold uppercase text-center">{recoveryStatus}</p>}
                            <div className="flex gap-2">
                              <Button variant="ghost" className="flex-1" onClick={() => setRecoveryStep('username')}>Voltar</Button>
                              <Button type="submit" className="vibrant-button flex-1" disabled={recoveryStatus === "Verificando..."}>Verificar</Button>
                            </div>
                          </form>
                        )}

                        {recoveryStep === 'new_password' && (
                          <form onSubmit={handleResetPassword} className="space-y-6">
                            <div className="space-y-4">
                              <Label className="text-[10px] uppercase tracking-[0.2em] font-bold text-brand-primary">Nova Senha</Label>
                              <Input 
                                type="password"
                                placeholder="Digite sua nova senha" 
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="glass-input h-14"
                              />
                            </div>
                             {recoveryError && <p className="text-red-500 text-xs font-bold uppercase">{recoveryError}</p>}
                             {recoveryStatus && <p className="text-brand-primary text-xs font-bold uppercase">{recoveryStatus}</p>}
                            <Button type="submit" className="vibrant-button w-full" disabled={!!recoveryStatus && !recoveryStatus.includes('sucesso')}>Atualizar Senha</Button>
                          </form>
                        )}
                      </div>
                    )}
                  </Card>
                ) : (
                  <div className="space-y-8">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <h2 className="text-2xl md:text-3xl font-display font-bold tracking-tight">Meus Pedidos</h2>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-brand-dark/50">Olá, <span className="font-bold text-brand-dark">{currentUser}</span></span>
                        <Button variant="outline" size="sm" onClick={() => {
                          setCurrentUser(null);
                          localStorage.removeItem("eli_embroidery_user");
                        }} className="border-brand-primary/20 text-brand-primary hover:bg-brand-primary/5">
                          Sair
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                      {orders.filter(o => o.customerName === currentUser).map((order) => (
                        <Card key={order.id} className="glass-card overflow-hidden hover-card">
                          <div className="aspect-video bg-brand-primary/5 relative overflow-hidden flex items-center justify-center border-b border-brand-primary/10">
                            {order.orderType === "image" ? (
                              order.images && order.images.length > 0 ? (
                                <div className="flex overflow-x-auto snap-x snap-mandatory h-full w-full custom-scrollbar">
                                  {order.images.map((img, idx) => (
                                    <div key={idx} className="flex-shrink-0 w-full h-full snap-center relative flex items-center justify-center p-4">
                                      {img.preview === "pdf-placeholder" || img.thumbnail === "pdf-placeholder" ? (
                                        <div className="flex flex-col items-center gap-2">
                                          <FileType className="w-12 h-12 text-brand-primary opacity-40" />
                                          <span className="text-xs font-medium text-brand-dark/40 truncate max-w-[200px]">{img.name || "Arquivo PDF"}</span>
                                        </div>
                                      ) : (
                                        <img 
                                          src={img.preview} 
                                          alt={`Preview ${idx}`} 
                                          className="w-full h-full object-contain cursor-pointer" 
                                          onClick={() => handleViewImage(img.preview)}
                                          referrerPolicy="no-referrer" 
                                        />
                                      )}
                                      {order.images!.length > 1 && (
                                        <div className="absolute bottom-2 right-2 bg-brand-dark/50 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                                          {idx + 1} / {order.images!.length}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                order.imagePreview === "pdf-placeholder" ? (
                                  <div className="flex flex-col items-center gap-2">
                                    <FileType className="w-12 h-12 text-brand-primary opacity-40" />
                                    <span className="text-xs font-medium text-brand-dark/40">Arquivo PDF</span>
                                  </div>
                                ) : (
                                  <img src={order.imagePreview!} alt="Preview" className="w-full h-full object-contain p-4 cursor-pointer" onClick={() => handleViewImage(order.imagePreview!)} referrerPolicy="no-referrer" />
                                )
                              )
                            ) : (
                              <div className="flex flex-col items-center gap-2 p-6 text-center">
                                <Type className="w-12 h-12 text-brand-primary opacity-40" />
                                <p className="text-lg font-bold text-brand-dark line-clamp-2 italic">"{order.textContent}"</p>
                                <p className="text-xs text-brand-dark/40 uppercase tracking-widest font-bold">{order.fontStyle}</p>
                              </div>
                            )}
                            <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
                              <Badge className={cn(
                                "h-8 px-4 rounded-full border-none shadow-sm font-bold text-[10px] uppercase tracking-wider",
                                order.status === "Pendente" ? "bg-amber-500 text-white" :
                                order.status === "Em Produção" ? "bg-blue-500 text-white" :
                                order.status === "Concluído" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
                              )}>
                                {order.status}
                              </Badge>
                              {(order.fileUrl || (order.matrixFiles && order.matrixFiles.length > 0)) && (
                                <Badge className="h-8 px-4 rounded-full border-none shadow-sm font-bold text-[10px] uppercase tracking-wider bg-indigo-600 text-white">
                                  {order.matrixFiles && order.matrixFiles.length > 1 ? `${order.matrixFiles.length} Matrizes Enviadas` : 'Matriz Enviada'}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <CardContent className="p-6 md:p-8 space-y-6">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="text-[10px] uppercase tracking-widest font-bold text-brand-primary mb-1">Data do Pedido</p>
                                <p className="text-sm font-medium">{format(order.date, "dd/MM/yyyy")}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-[10px] uppercase tracking-widest font-bold text-brand-primary mb-1">Previsão</p>
                                <p className="text-sm font-medium">{format(order.deliveryDate, "dd/MM/yyyy")}</p>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-brand-primary/5">
                              <div>
                                <p className="text-[10px] uppercase tracking-widest font-bold text-brand-primary mb-1">Medida</p>
                                <p className="text-xs font-medium">{order.size} cm</p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-widest font-bold text-brand-primary mb-1">Formato</p>
                                <p className="text-xs font-medium">{order.format}</p>
                              </div>
                            </div>
                          </CardContent>
                           {order.status === "Concluído" && (order.fileUrl || (order.matrixFiles && order.matrixFiles.length > 0)) && (
                            <CardFooter className="p-6 bg-emerald-500/5 border-t border-emerald-500/10 flex flex-col gap-3">
                              {order.matrixFiles && order.matrixFiles.length > 0 ? (
                                order.matrixFiles.map((file, idx) => (
                                  <Button 
                                    key={idx} 
                                    onClick={() => downloadFile(file.url, file.name || `matriz-${idx + 1}.pes`)}
                                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white h-12 rounded-xl font-bold flex items-center justify-between px-6 gap-2"
                                  >
                                    <span className="truncate flex-1 text-left">{file.name || `Matriz ${idx + 1}`}</span>
                                    <Upload className="w-4 h-4 rotate-180 flex-shrink-0" />
                                  </Button>
                                ))
                              ) : (
                                order.fileUrl && (
                                  <Button 
                                    onClick={() => downloadFile(order.fileUrl!, order.fileName || "matriz.pes")}
                                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white h-12 rounded-xl font-bold flex items-center gap-2"
                                  >
                                    <Upload className="w-4 h-4 rotate-180" /> Baixar Matriz Pronta
                                  </Button>
                                )
                              )}
                            </CardFooter>
                          )}
                        </Card>
                      ))}
                      {orders.filter(o => o.customerName === currentUser).length === 0 && (
                        <div className="col-span-full py-20 text-center space-y-4">
                          <History className="w-16 h-16 text-brand-primary/20 mx-auto" />
                          <p className="text-xl text-brand-dark/40 font-medium">Você ainda não tem pedidos.</p>
                          <Button onClick={() => setActiveTab("new-order")} variant="link" className="text-brand-primary font-bold">Fazer meu primeiro pedido</Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            </TabsContent>

            {isAdminMode && (
              <TabsContent value="admin" key="admin">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-8"
                >
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div>
                      <h2 className="text-2xl md:text-3xl font-display font-bold tracking-tight">Painel Administrativo</h2>
                      <p className="text-sm md:text-base text-brand-dark/50">Gerencie todos os pedidos e envie as matrizes prontas</p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Badge variant="outline" className="h-8 md:h-10 px-4 md:px-6 rounded-lg md:rounded-xl border-brand-primary/20 text-brand-primary font-bold text-[10px] md:text-xs">
                        {orders.length} Pedidos
                      </Badge>
                      <Badge 
                        variant="outline" 
                        title={storageErrorMessage || ""}
                        className={cn(
                          "h-8 md:h-10 px-4 md:px-6 rounded-lg md:rounded-xl font-bold transition-all text-[10px] md:text-xs",
                          storageStatus === 'ok' ? "border-emerald-500/20 text-emerald-600 bg-emerald-50" : 
                          storageStatus === 'checking' ? "border-blue-500/20 text-blue-600 bg-blue-50" :
                          "border-red-500/20 text-red-600 bg-red-50 animate-pulse"
                        )}
                      >
                        {storageStatus === 'ok' ? "Nuvem OK" : 
                         storageStatus === 'checking' ? "Verificando..." : 
                         "Erro na Nuvem"}
                      </Badge>
                    </div>
                  </div>

                  <Tabs value={adminStatusFilter} onValueChange={setAdminStatusFilter} className="w-full">
                    <TabsList className="bg-brand-primary/5 p-1 rounded-lg h-10 md:h-12 border border-brand-primary/10 mb-6 w-full overflow-x-auto no-scrollbar justify-start">
                      <TabsTrigger value="Pendente" className="px-3 md:px-6 h-full rounded-md md:rounded-lg data-[state=active]:bg-amber-500 data-[state=active]:text-white font-bold text-[10px] md:text-xs uppercase tracking-wider flex-shrink-0">
                        Pendentes ({orders.filter(o => o.status === "Pendente").length})
                      </TabsTrigger>
                      <TabsTrigger value="Em Produção" className="px-3 md:px-6 h-full rounded-md md:rounded-lg data-[state=active]:bg-blue-500 data-[state=active]:text-white font-bold text-[10px] md:text-xs uppercase tracking-wider flex-shrink-0">
                        Produção ({orders.filter(o => o.status === "Em Produção").length})
                      </TabsTrigger>
                      <TabsTrigger value="Concluído" className="px-3 md:px-6 h-full rounded-md md:rounded-lg data-[state=active]:bg-emerald-500 data-[state=active]:text-white font-bold text-[10px] md:text-xs uppercase tracking-wider flex-shrink-0">
                        Concluídos ({orders.filter(o => o.status === "Concluído").length})
                      </TabsTrigger>
                      <TabsTrigger value="Cancelado" className="px-3 md:px-6 h-full rounded-md md:rounded-lg data-[state=active]:bg-red-500 data-[state=active]:text-white font-bold text-[10px] md:text-xs uppercase tracking-wider flex-shrink-0">
                        Cancelados ({orders.filter(o => o.status === "Cancelado").length})
                      </TabsTrigger>
                    </TabsList>

                    <div className="grid grid-cols-1 gap-4 md:hidden">
                      {orders.filter(o => o.status === adminStatusFilter).map((order) => (
                        <Card key={order.id} className="glass-card p-4 md:p-6 space-y-4 hover:shadow-lg transition-all border-brand-primary/10">
                          <div className="flex justify-between items-start">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] text-brand-primary font-bold uppercase tracking-widest">{format(order.date, "dd/MM/yyyy")}</span>
                              <span className="font-bold text-lg md:text-xl text-brand-dark leading-tight">{order.customerName}</span>
                              {order.customerWhatsapp && (
                                <a 
                                  href={`https://wa.me/${order.customerWhatsapp.replace(/\D/g, '')}`} 
                                  target="_blank" 
                                  rel="noreferrer"
                                  className="text-xs text-brand-primary font-bold flex items-center gap-1"
                                >
                                  {order.customerWhatsapp}
                                </a>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 rounded-lg text-brand-primary bg-brand-primary/5"
                                onClick={() => setEditingOrder(order)}
                              >
                                <Edit3 className="w-4 h-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 rounded-lg text-red-500 bg-red-50"
                                onClick={() => deleteOrder(order.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 p-3 bg-brand-primary/5 rounded-xl border border-brand-primary/10">
                            {order.orderType === "image" ? (
                              <div className="flex -space-x-2">
                                {(order.images && order.images.length > 0) ? (
                                  order.images.slice(0, 2).map((img, idx) => (
                                    <div key={idx} className="w-10 h-10 rounded-lg bg-white overflow-hidden border border-brand-primary/20 shadow-sm" onClick={() => handleViewImage(img.preview)}>
                                      <img src={img.thumbnail || img.preview} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                    </div>
                                  ))
                                ) : (
                                  <div className="w-10 h-10 rounded-lg bg-white overflow-hidden border border-brand-primary/20" onClick={() => handleViewImage(order.imagePreview! || order.imageThumbnail!)}>
                                    <img src={order.imageThumbnail || order.imagePreview || ""} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center border border-brand-primary/20">
                                <Type className="w-5 h-5 text-brand-primary opacity-40" />
                              </div>
                            )}
                            <div className="flex flex-col">
                              <span className="text-xs font-bold truncate max-w-[150px]">{order.orderType === "text" ? order.textContent : "Logo/Imagem"}</span>
                              <span className="text-[10px] text-brand-dark/40 uppercase font-medium">{order.size} cm • {order.format}</span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 pt-2">
                            {order.intent && (
                              <Badge className={cn(
                                "h-6 px-3 rounded-full border-none text-[9px] font-bold uppercase",
                                order.intent === "budget" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                              )}>
                                {order.intent === "budget" ? "Orçamento" : "Produção"}
                              </Badge>
                            )}
                            <div className="flex-1 flex justify-end items-center gap-2">
                              <div className="w-8 flex justify-center">
                                {(order.fileUrl || (order.matrixFiles && order.matrixFiles.length > 0)) && (
                                  <Badge className="h-6 px-2 rounded-full border-none bg-indigo-600 text-white text-[8px] font-bold uppercase">
                                    OK
                                  </Badge>
                                )}
                              </div>
                              <Select 
                                value={order.status} 
                                onValueChange={(v: any) => updateOrderStatus(order.id, v)}
                              >
                                <SelectTrigger className={cn(
                                  "h-8 px-3 rounded-full border-none text-[9px] font-bold uppercase text-white w-28",
                                  order.status === "Pendente" ? "bg-amber-500" :
                                  order.status === "Em Produção" ? "bg-blue-500" :
                                  order.status === "Concluído" ? "bg-emerald-500" : "bg-red-500"
                                )}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-brand-light border-brand-primary/10">
                                  <SelectItem value="Pendente">Pendente</SelectItem>
                                  <SelectItem value="Em Produção">Produção</SelectItem>
                                  <SelectItem value="Concluído">Concluído</SelectItem>
                                  <SelectItem value="Cancelado">Cancelado</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>

                    <Card className="glass-card overflow-hidden hidden md:block">
                      <Table>
                        <TableHeader className="bg-brand-primary/5">
                          <TableRow className="hover:bg-transparent border-brand-primary/10">
                            <TableHead className="w-[100px] font-bold text-brand-primary uppercase tracking-widest text-[10px]">Data</TableHead>
                            <TableHead className="font-bold text-brand-primary uppercase tracking-widest text-[10px]">Cliente</TableHead>
                            <TableHead className="font-bold text-brand-primary uppercase tracking-widest text-[10px]">Tipo/Detalhe</TableHead>
                            <TableHead className="font-bold text-brand-primary uppercase tracking-widest text-[10px]">Status</TableHead>
                            <TableHead className="text-right font-bold text-brand-primary uppercase tracking-widest text-[10px]">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {orders.filter(o => o.status === adminStatusFilter).map((order) => (
                            <TableRow key={order.id} className="border-brand-primary/5 hover:bg-brand-primary/[0.02] transition-colors">
                              <TableCell className="font-medium text-sm">{format(order.date, "dd/MM")}</TableCell>
                              <TableCell>
                                <div className="flex flex-col">
                                  <span className="font-bold text-brand-dark">{order.customerName}</span>
                                  {order.customerWhatsapp ? (
                                    <a 
                                      href={`https://wa.me/${order.customerWhatsapp.replace(/\D/g, '')}`} 
                                      target="_blank" 
                                      rel="noreferrer"
                                      className="text-[10px] text-brand-primary font-bold hover:underline flex items-center gap-1"
                                    >
                                      {order.customerWhatsapp}
                                    </a>
                                  ) : (
                                    <span className="text-[10px] text-brand-dark/40 italic">Sem WhatsApp</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-3 text-left">
                                  {order.orderType === "image" ? (
                                    <div className="flex -space-x-3 group cursor-pointer" onClick={() => handleViewImage(order.imagePreview || order.imageThumbnail || "")}>
                                      {(order.images && order.images.length > 0) ? (
                                        order.images.slice(0, 2).map((img, idx) => (
                                          <div key={idx} className="w-12 h-12 rounded-lg border-2 border-white overflow-hidden shadow-sm bg-white">
                                            {img.thumbnail === "pdf-placeholder" ? (
                                              <div className="w-full h-full bg-brand-primary/10 flex items-center justify-center">
                                                <FileType className="w-6 h-6 text-brand-primary opacity-40" />
                                              </div>
                                            ) : (
                                              <img src={img.thumbnail || img.preview} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                            )}
                                          </div>
                                        ))
                                      ) : (
                                        <div className="w-12 h-12 rounded-lg bg-brand-primary/5 border border-brand-primary/10 overflow-hidden flex items-center justify-center">
                                          {order.imageThumbnail === "pdf-placeholder" ? (
                                            <FileType className="w-6 h-6 text-brand-primary opacity-40" />
                                          ) : (
                                            <img src={order.imageThumbnail || order.imagePreview || ""} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                          )}
                                        </div>
                                      )}
                                      {order.images && order.images.length > 2 && (
                                        <div className="w-12 h-12 rounded-lg bg-brand-dark/80 flex items-center justify-center text-[10px] text-white font-bold border-2 border-white">
                                          +{order.images.length - 2}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="w-10 h-10 rounded-lg bg-brand-primary/5 border border-brand-primary/10 flex items-center justify-center">
                                      <Type className="w-5 h-5 text-brand-primary opacity-40" />
                                    </div>
                                  )}
                                  <div className="flex flex-col">
                                    <span className="text-xs font-bold">{order.orderType === "text" ? order.textContent : "Logo/Imagem"}</span>
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] text-brand-dark/40 uppercase tracking-widest">{order.size} cm • {order.format}</span>
                                      {order.intent && (
                                        <Select 
                                          value={order.intent} 
                                          onValueChange={(v: any) => updateOrderIntent(order.id, v)}
                                        >
                                          <SelectTrigger className={cn(
                                            "h-5 px-2 rounded-full border-none text-[8px] font-bold uppercase tracking-tighter w-auto",
                                            order.intent === "budget" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                                          )}>
                                            {order.intent === "budget" ? "Orçamento" : "Produção"}
                                          </SelectTrigger>
                                          <SelectContent className="bg-brand-light border-brand-primary/10">
                                            <SelectItem value="budget">Orçamento</SelectItem>
                                            <SelectItem value="produce">Produção</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div className="w-8 flex justify-center flex-shrink-0">
                                    {(order.fileUrl || (order.matrixFiles && order.matrixFiles.length > 0)) && (
                                      <Badge className="h-4 px-2 rounded-full border-none bg-indigo-600 text-white text-[8px] font-bold uppercase tracking-tighter">
                                        OK
                                      </Badge>
                                    )}
                                  </div>
                                  <Select 
                                    value={order.status} 
                                    onValueChange={(v: any) => updateOrderStatus(order.id, v)}
                                  >
                                  <SelectTrigger className={cn(
                                    "h-8 px-3 rounded-full border-none text-[10px] font-bold uppercase tracking-wider text-white w-32",
                                    order.status === "Pendente" ? "bg-amber-500" :
                                    order.status === "Em Produção" ? "bg-blue-500" :
                                    order.status === "Concluído" ? "bg-emerald-500" : "bg-red-500"
                                  )}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="bg-brand-light border-brand-primary/10">
                                    <SelectItem value="Pendente">Pendente</SelectItem>
                                    <SelectItem value="Em Produção">Produção</SelectItem>
                                    <SelectItem value="Concluído">Concluído</SelectItem>
                                    <SelectItem value="Cancelado">Cancelado</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2 text-right">
                                  {order.imagePreview && order.orderType === "image" && (
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      className="h-9 w-9 rounded-lg text-brand-primary hover:bg-brand-primary/10"
                                      onClick={() => handleViewImage(order.imagePreview!)}
                                      title="Visualizar Imagem"
                                    >
                                      <Maximize2 className="w-4 h-4" />
                                    </Button>
                                  )}
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-9 w-9 rounded-lg text-brand-primary hover:bg-brand-primary/10"
                                    onClick={() => setEditingOrder(order)}
                                    title="Editar/Ver Detalhes"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-9 w-9 rounded-lg text-red-500 hover:bg-red-50"
                                    onClick={() => deleteOrder(order.id)}
                                    title="Excluir"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        {orders.filter(o => o.status === adminStatusFilter).length === 0 && (
                          <TableRow>
                            <TableCell colSpan={5} className="py-20 text-center text-brand-dark/30 font-medium italic">
                              Nenhum pedido {adminStatusFilter.toLowerCase()} encontrado.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </Card>
                </Tabs>
              </motion.div>
            </TabsContent>
            )}
          </AnimatePresence>
        </Tabs>
      </main>

      {/* Admin Login Modal */}
      <AnimatePresence>
        {showAdminLogin && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-brand-dark/60 backdrop-blur-sm"
              onClick={() => setShowAdminLogin(false)}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative z-10 w-full max-w-md"
            >
              <Card className="glass-card shadow-2xl">
                <CardHeader className="text-center pt-8 md:pt-12 space-y-2">
                  <div className="w-16 h-16 bg-brand-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4 md:mb-6 border border-brand-primary/20">
                    <Settings className="w-8 h-8 text-brand-primary" />
                  </div>
                  <CardTitle className="text-2xl md:text-3xl font-display font-bold tracking-tight">Painel Administrativo</CardTitle>
                  <CardDescription className="text-sm md:text-base">Acesso restrito à administração</CardDescription>
                </CardHeader>
                <form onSubmit={handleAdminLogin}>
                  <CardContent className="p-6 md:p-10 space-y-6">
                    <div className="space-y-3">
                      <Label className="text-[10px] uppercase tracking-widest font-bold text-brand-primary">Senha de Acesso</Label>
                      <Input 
                        type="password" 
                        placeholder="Digite a senha mestra" 
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        className="glass-input h-14 text-lg text-center"
                        autoFocus
                      />
                    </div>
                  </CardContent>
                  <CardFooter className="p-6 md:p-10 bg-brand-primary/5 border-t border-brand-primary/10">
                    <Button type="submit" className="vibrant-button w-full h-12 md:h-14 text-base md:text-lg">
                      Entrar no Painel
                    </Button>
                  </CardFooter>
                </form>
              </Card>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Matrix Upload Modal */}
      <AnimatePresence>
        {editingOrder && (
          <div className="fixed inset-0 z-[100] overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-brand-dark/60 backdrop-blur-sm"
                onClick={() => setEditingOrder(null)}
              />
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="relative z-10 w-full max-w-lg my-8"
              >
              <Card className="glass-card shadow-2xl">
                <CardHeader className="p-4 md:p-8 border-b border-brand-primary/10 bg-brand-primary/5">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-xl md:text-2xl font-display font-bold">Enviar Matriz Pronta</CardTitle>
                      <CardDescription className="text-xs md:text-sm">Pedido de {orderToShow.customerName}</CardDescription>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setEditingOrder(null)} className="rounded-full">
                      <X className="w-5 h-5" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-4 md:p-8 space-y-6 md:space-y-8">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase tracking-widest font-bold text-brand-primary">Cliente</p>
                      <p className="text-sm font-medium">{orderToShow.customerName}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase tracking-widest font-bold text-brand-primary">WhatsApp</p>
                      {orderToShow.customerWhatsapp ? (
                        <a 
                          href={`https://wa.me/${orderToShow.customerWhatsapp.replace(/\D/g, '')}`} 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-sm font-medium text-brand-primary hover:underline"
                        >
                          {orderToShow.customerWhatsapp}
                        </a>
                      ) : (
                        <p className="text-sm font-medium text-brand-dark/40 italic">Não informado</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase tracking-widest font-bold text-brand-primary">Medida</p>
                      <p className="text-sm font-medium">{orderToShow.size} cm</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase tracking-widest font-bold text-brand-primary">Formato</p>
                      <p className="text-sm font-medium">{orderToShow.format}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase tracking-widest font-bold text-brand-primary">Tipo</p>
                      <p className="text-sm font-medium">{orderToShow.orderType === 'image' ? 'Imagem/Logo' : 'Apenas Texto'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase tracking-widest font-bold text-brand-primary">Previsão</p>
                      <p className="text-sm font-medium">{format(orderToShow.deliveryDate, "dd/MM/yyyy")}</p>
                    </div>
                  </div>
                  
                  {orderToShow.orderType === 'text' && (
                    <div className="p-4 bg-brand-primary/5 rounded-xl border border-brand-primary/10 space-y-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-widest font-bold text-brand-primary mb-1">Texto do Bordado</p>
                        <p className="text-lg font-bold italic">"{orderToShow.textContent}"</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-widest font-bold text-brand-primary mb-1">Estilo da Fonte</p>
                        <p className="text-sm font-medium">{orderToShow.fontStyle}</p>
                      </div>
                    </div>
                  )}

                  {orderToShow.notes && (
                    <div className="p-4 bg-brand-primary/5 rounded-xl border border-brand-primary/10">
                      <p className="text-[10px] uppercase tracking-widest font-bold text-brand-primary mb-2">Observações do Cliente</p>
                      <p className="text-sm italic text-brand-dark/70">"{orderToShow.notes}"</p>
                    </div>
                  )}

                  {/* Admin Matrix Uploading / Files List Section */}
                  <div className="space-y-6">
                    {(orderToShow.orderType === 'image') && (
                      <div className="space-y-4">
                        <p className="text-[10px] uppercase tracking-widest font-bold text-brand-primary">Imagens de Referência</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {orderToShow.images && orderToShow.images.length > 0 ? (
                            orderToShow.images.map((img, idx) => (
                              <div key={idx} className="relative aspect-square rounded-xl border border-brand-primary/10 overflow-hidden bg-white flex items-center justify-center group">
                                {img.thumbnail === "pdf-placeholder" ? (
                                  <FileType className="w-8 h-8 text-brand-primary opacity-30" />
                                ) : (
                                  <img 
                                    src={img.thumbnail || img.preview} 
                                    className="w-full h-full object-cover cursor-zoom-in" 
                                    onClick={() => handleViewImage(img.preview)}
                                    referrerPolicy="no-referrer"
                                  />
                                )}
                                <div className="absolute inset-0 bg-brand-dark/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <Button size="icon" variant="ghost" onClick={() => handleViewImage(img.preview)} className="h-8 w-8 text-white">
                                    <Maximize2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="col-span-full relative aspect-video rounded-xl border border-brand-primary/10 overflow-hidden bg-white flex items-center justify-center group">
                               {orderToShow.imagePreview === "pdf-placeholder" ? (
                                  <FileType className="w-12 h-12 text-brand-primary opacity-30" />
                               ) : (
                                  <img 
                                    src={orderToShow.imagePreview || ""} 
                                    className="max-h-full max-w-full object-contain cursor-zoom-in" 
                                    onClick={() => handleViewImage(orderToShow.imagePreview!)}
                                    referrerPolicy="no-referrer"
                                  />
                               )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Matrix Files Management */}
                    <div className="space-y-4 pt-4 border-t border-brand-primary/5 text-left">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-1">
                          <p className="text-[10px] uppercase tracking-widest font-bold text-brand-primary">Arquivos de Bordado (Matrizes)</p>
                          {submitStatus && submitStatus.includes("Enviando") && (
                             <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-600 animate-pulse">
                               <Clock className="w-3 h-3 flex-shrink-0" />
                               {submitStatus}
                             </div>
                          )}
                        </div>
                        {orderToShow && (
                          <Badge variant="outline" className="text-[10px] font-bold">
                            {orderToShow.matrixFiles?.length || (orderToShow.fileUrl ? 1 : 0)} Arquivo(s)
                          </Badge>
                        )}
                      </div>

                      <div className="space-y-2">
                        {orderToShow && orderToShow.matrixFiles && orderToShow.matrixFiles.length > 0 ? (
                          orderToShow.matrixFiles.map((file, idx) => (
                            <div key={file.url || idx} className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                              <div className="flex items-center gap-3 overflow-hidden">
                                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                                  <Upload className="w-4 h-4 text-emerald-600 rotate-180" />
                                </div>
                                <span className="text-sm font-medium text-emerald-800 truncate">{file.name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button 
                                  size="icon" 
                                  variant="ghost" 
                                  type="button"
                                  className="h-8 w-8 text-emerald-600 hover:bg-emerald-100" 
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    downloadFile(file.url, file.name);
                                  }}
                                >
                                  <Download className="w-4 h-4" />
                                </Button>
                                <Button 
                                  size="icon" 
                                  variant="ghost" 
                                  type="button"
                                  className="h-8 w-8 text-red-500 hover:bg-red-50 relative z-50" 
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    console.log("DEBUG: Trash icon clicked for modern file", { id: orderToShow.id, idx });
                                    removeOrderMatrixFile(orderToShow.id, idx);
                                  }}
                                >
                                  <Trash2 className="w-4 h-4 pointer-events-none" />
                                </Button>
                              </div>
                            </div>
                          ))
                        ) : orderToShow && orderToShow.fileUrl ? (
                          <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                            <div className="flex items-center gap-3 overflow-hidden">
                              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                                <Upload className="w-4 h-4 text-emerald-600 rotate-180" />
                              </div>
                              <span className="text-sm font-medium text-emerald-800 truncate">{orderToShow.fileName || "matriz.zip"}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button 
                                  size="icon" 
                                  variant="ghost" 
                                  type="button"
                                  className="h-8 w-8 text-emerald-600 hover:bg-emerald-100" 
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    downloadFile(orderToShow.fileUrl!, orderToShow.fileName || "matriz.zip");
                                  }}
                                >
                                   <Download className="w-4 h-4" />
                                </Button>
                                <Button 
                                  size="icon" 
                                  variant="ghost" 
                                  type="button"
                                  className="h-8 w-8 text-red-500 hover:bg-red-50 relative z-50" 
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    console.log("DEBUG: Trash icon clicked for legacy file", { id: orderToShow.id });
                                    removeOrderMatrixFile(orderToShow.id, 0, true);
                                  }}
                                >
                                  <Trash2 className="w-4 h-4 pointer-events-none" />
                                </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="p-8 text-center border-2 border-dashed border-brand-primary/10 rounded-2xl bg-white/50">
                            <History className="w-10 h-10 text-brand-primary/20 mx-auto mb-2" />
                            <p className="text-xs text-brand-dark/40 italic font-medium">Nenhuma matriz enviada ainda</p>
                          </div>
                        )}

                        {orderToShow && (
                          <div className="relative group border-2 border-dashed border-brand-primary/20 rounded-2xl p-6 transition-all flex flex-col items-center justify-center text-center hover:border-brand-primary/40 hover:bg-brand-primary/5 cursor-pointer mt-4">
                            <PlusCircle className="w-8 h-8 text-brand-primary mb-2 opacity-40 group-hover:opacity-100" />
                            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-primary opacity-60 group-hover:opacity-100">Adicionar Nova Matriz</p>
                            <input 
                              type="file" 
                              className="absolute inset-0 opacity-0 cursor-pointer" 
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  addOrderMatrixFile(orderToShow.id, file);
                                }
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
                {submitStatus && (
                  <div className="px-8 pb-8">
                    <div className="flex items-center gap-3 text-brand-primary font-bold text-sm animate-pulse">
                      <Clock className="w-4 h-4" /> {submitStatus}
                    </div>
                  </div>
                )}
              </Card>
            </motion.div>
          </div>
        </div>
      )}
      </AnimatePresence>

      {/* Image Viewer Modal */}
      <AnimatePresence>
        {viewingImage && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-brand-dark/95 backdrop-blur-md"
              onClick={() => setViewingImage(null)}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative z-10 max-w-5xl w-full h-full flex flex-col items-center justify-center pointer-events-none"
            >
              <div className="absolute top-0 right-0 p-4 pointer-events-auto">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setViewingImage(null)} 
                  className="rounded-full bg-white/10 text-white hover:bg-white/20"
                >
                  <X className="w-6 h-6" />
                </Button>
              </div>
              <img 
                src={viewingImage} 
                alt="Full Preview" 
                className="max-w-full max-h-[85vh] object-contain shadow-2xl rounded-lg pointer-events-auto"
                referrerPolicy="no-referrer"
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="py-20 border-t border-brand-primary/10 mt-20">
        <div className="container mx-auto px-6 text-center space-y-6">
          <div className="flex items-center justify-center gap-3 opacity-20 grayscale">
            <div className="w-10 h-10 bg-[#3d2b1f] rounded-lg flex items-center justify-center border border-dashed border-white/30">
              <span className="text-white text-sm font-serif font-bold italic tracking-tighter">EB</span>
            </div>
            <span className="text-xl font-display font-bold">EliBord's</span>
          </div>
          <p className="text-[10px] text-brand-dark/20 font-medium">© 2026 EliBord's. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
