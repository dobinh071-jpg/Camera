import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Bot, User, Loader2, ImagePlus } from 'lucide-react';
import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';
import { DVR, Camera } from '../types';
import { supabase } from '../lib/supabase';
import { queryContainerLogs, getStatistics, queryDeviceStatus, queryVehicleEvents, queryTallyEvents, getSoftwareGuide, getSystemConfig } from '../lib/supabase-queries';

interface Props {
  dvrs: DVR[];
  cameras: Camera[];
  setDvrs: React.Dispatch<React.SetStateAction<DVR[]>>;
  setCameras: React.Dispatch<React.SetStateAction<Camera[]>>;
  useMock: boolean;
  refetch: () => void;
}

interface Message {
  id: string;
  role: 'user' | 'ai';
  text: string;
  image?: string; // Base64 image data
}

const addDvrDeclaration: FunctionDeclaration = {
  name: 'addDvr',
  description: 'Thêm một Đầu ghi (DVR) mới vào hệ thống.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: 'Tên đầu ghi' },
      ip_address: { type: Type.STRING, description: 'Địa chỉ IP của đầu ghi' },
      port: { type: Type.NUMBER, description: 'Cổng (Port) của đầu ghi, mặc định là 80' },
      password: { type: Type.STRING, description: 'Mật khẩu của đầu ghi' },
      type: { type: Type.STRING, description: "Loại đầu ghi: 'hikvision', 'dahua', hoặc 'other'" }
    },
    required: ['name', 'ip_address']
  }
};

const addCameraDeclaration: FunctionDeclaration = {
  name: 'addCamera',
  description: 'Thêm một Camera mới vào một Đầu ghi đã có.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: 'Tên camera' },
      dvr_name: { type: Type.STRING, description: 'Tên của đầu ghi mà camera này thuộc về' },
      ip_address: { type: Type.STRING, description: 'Địa chỉ IP của camera' },
      password: { type: Type.STRING, description: 'Mật khẩu của camera (nếu có)' }
    },
    required: ['name', 'dvr_name', 'ip_address']
  }
};

const queryContainerLogsDeclaration: FunctionDeclaration = {
  name: 'queryContainerLogs',
  description: 'Tìm kiếm lịch sử sự kiện container (xe vào/ra/cân). Dùng khi người dùng hỏi về container cụ thể, lịch sử làn, hoặc sự kiện gần đây.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      date_from: { type: Type.STRING, description: 'Ngày bắt đầu (ISO format, ví dụ: 2026-03-17T00:00:00)' },
      date_to: { type: Type.STRING, description: 'Ngày kết thúc (ISO format)' },
      lane_id: { type: Type.STRING, description: 'ID làn: LAN_VAO_1, LAN_VAO_2, TRAM_CAN, LAN_RA_1, LAN_RA_2' },
      container_no: { type: Type.STRING, description: 'Số container cần tìm (tìm gần đúng)' },
      event_type: { type: Type.STRING, description: 'Loại sự kiện: IN, OUT, hoặc WEIGH' },
      limit: { type: Type.NUMBER, description: 'Số kết quả tối đa (mặc định 20)' }
    }
  }
};

const getStatisticsDeclaration: FunctionDeclaration = {
  name: 'getStatistics',
  description: 'Lấy thống kê tổng hợp về container: tổng số sự kiện, phân theo làn, phân theo loại, container phổ biến nhất. Dùng khi người dùng hỏi "bao nhiêu xe", "thống kê", "tổng hợp".',
  parameters: {
    type: Type.OBJECT,
    properties: {
      date_from: { type: Type.STRING, description: 'Ngày bắt đầu (ISO format)' },
      date_to: { type: Type.STRING, description: 'Ngày kết thúc (ISO format)' },
      lane_id: { type: Type.STRING, description: 'Lọc theo làn cụ thể' },
      event_type: { type: Type.STRING, description: 'Lọc theo loại: IN, OUT, WEIGH' }
    }
  }
};

const queryDeviceStatusDeclaration: FunctionDeclaration = {
  name: 'queryDeviceStatus',
  description: 'Kiểm tra trạng thái online/offline của thiết bị (DVR hoặc Camera). Dùng khi người dùng hỏi về tình trạng thiết bị, camera nào offline.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      device_type: { type: Type.STRING, description: 'Loại thiết bị: dvr hoặc camera' },
      device_name: { type: Type.STRING, description: 'Tên thiết bị cần kiểm tra (tìm gần đúng)' }
    }
  }
};

const queryVehicleEventsDeclaration: FunctionDeclaration = {
  name: 'queryVehicleEvents',
  description: 'Tìm kiếm lịch sử xe ra vào bãi (theo biển số). Dùng khi người dùng hỏi về xe, biển số.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      date_from: { type: Type.STRING, description: 'Ngày bắt đầu (ISO format)' },
      date_to: { type: Type.STRING, description: 'Ngày kết thúc (ISO format)' },
      plate: { type: Type.STRING, description: 'Biển số xe cần tìm' },
      type: { type: Type.STRING, description: 'Loại: in hoặc out' },
      limit: { type: Type.NUMBER, description: 'Số kết quả tối đa' }
    }
  }
};

const getSystemConfigDeclaration: FunctionDeclaration = {
  name: 'getSystemConfig',
  description: 'Lấy thông tin cấu hình hệ thống: số làn, số camera, chi tiết từng làn, phương pháp nhận diện. Dùng khi người dùng hỏi về hệ thống, cấu hình, số lượng camera/làn.',
  parameters: {
    type: Type.OBJECT,
    properties: {}
  }
};

const queryTallyEventsDeclaration: FunctionDeclaration = {
  name: 'queryTallyEvents',
  description: 'Tìm kiếm lịch sử sự kiện tally container (chụp sườn + nóc để kiểm tra hư hỏng). Dùng khi người dùng hỏi về tally, kiểm tra hư hỏng, damage, ảnh tally.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      date_from: { type: Type.STRING, description: 'Ngày bắt đầu (ISO format)' },
      date_to: { type: Type.STRING, description: 'Ngày kết thúc (ISO format)' },
      container_no: { type: Type.STRING, description: 'Số container cần tìm' },
      damage_status: { type: Type.STRING, description: 'Trạng thái hư hỏng cần lọc' },
      limit: { type: Type.NUMBER, description: 'Số kết quả tối đa (mặc định 20)' }
    }
  }
};

const getSoftwareGuideDeclaration: FunctionDeclaration = {
  name: 'getSoftwareGuide',
  description: 'Lấy hướng dẫn sử dụng phần mềm CamGuard: các tab, tính năng, cách dùng. Dùng khi người dùng hỏi "hướng dẫn", "cách dùng", "phần mềm có gì", "tính năng", "help", "giúp đỡ", "làm được gì".',
  parameters: {
    type: Type.OBJECT,
    properties: {}
  }
};

export default function AIChatbox({ dvrs, cameras, setDvrs, setCameras, useMock, refetch }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'ai', text: 'Xin chào! Tôi là trợ lý AI của hệ thống CamGuard. Bạn có thể hỏi tôi về:\n- Lịch sử container vào/ra/cân\n- Sự kiện tally & kiểm tra hư hỏng\n- Thống kê tổng hợp\n- Trạng thái thiết bị\n- Xe ra vào bãi\n- Cấu hình hệ thống\n- Hướng dẫn sử dụng phần mềm\n- Hoặc yêu cầu thêm DVR/Camera' }
  ]);
  const [input, setInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen, isLoading]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
            setSelectedImage(reader.result as string);
          };
          reader.readAsDataURL(file);
        }
        e.preventDefault(); // Prevent pasting the image name/text if any
        break; // Only handle the first image
      }
    }
  };

  const removeImage = () => {
    setSelectedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSend = async () => {
    if (!input.trim() && !selectedImage) return;
    
    const userMsg = input.trim();
    const currentImage = selectedImage;
    
    setInput('');
    setSelectedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text: userMsg, image: currentImage || undefined }]);
    setIsLoading(true);

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Thiếu API Key của Gemini');
      }

      const ai = new GoogleGenAI({ apiKey });
      
      const apiContents = messages.map(m => {
        const parts: any[] = [{ text: m.text }];
        if (m.image) {
          const base64Data = m.image.split(',')[1];
          const mimeType = m.image.split(';')[0].split(':')[1];
          parts.unshift({
            inlineData: {
              data: base64Data,
              mimeType: mimeType
            }
          });
        }
        return {
          role: m.role === 'ai' ? 'model' : 'user',
          parts: parts
        };
      });

      const currentUserParts: any[] = [];
      if (currentImage) {
        const base64Data = currentImage.split(',')[1];
        const mimeType = currentImage.split(';')[0].split(':')[1];
        currentUserParts.push({
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        });
      }
      currentUserParts.push({ text: userMsg || 'Phân tích hình ảnh này.' });
      
      apiContents.push({ role: 'user', parts: currentUserParts });

      // Provide context about existing devices
      const systemInstruction = `Bạn là trợ lý AI quản lý hệ thống CamGuard - Container Gate AI. Hãy trả lời ngắn gọn, thân thiện bằng tiếng Việt.

Bạn có thể:
1. Thêm Đầu ghi (DVR) và Camera vào hệ thống (gọi addDvr, addCamera)
2. Tra cứu lịch sử container vào/ra/cân (gọi queryContainerLogs)
3. Xem thống kê tổng hợp: số xe theo làn, theo loại, container phổ biến (gọi getStatistics)
4. Kiểm tra trạng thái thiết bị online/offline (gọi queryDeviceStatus)
5. Tra cứu lịch sử xe ra vào bãi theo biển số (gọi queryVehicleEvents)
6. Xem cấu hình hệ thống: số làn, số camera (gọi getSystemConfig)
7. Tra cứu lịch sử tally container: ảnh sườn/nóc, hư hỏng (gọi queryTallyEvents)
8. Hướng dẫn sử dụng phần mềm: các tính năng, tab, cách dùng (gọi getSoftwareGuide)

Hệ thống hiện có:
- 5 làn: Làn Vào 1, Làn Vào 2, Trạm Cân, Làn Ra 1, Làn Ra 2
- 14 cameras tổng cộng cho Container Gate
- 4 cameras cho Tally Station
- Đầu ghi: ${dvrs.map(d => d.name + ' (' + d.ip_address + ')').join(', ') || 'chưa có'}
- Camera: ${cameras.length} camera

Các bảng dữ liệu trong hệ thống:
- container_logs: Lịch sử xe container vào/ra cổng (số cont, làn, loại sự kiện IN/OUT/WEIGH, ảnh 4 góc)
- tally_events: Lịch sử tally container (số cont, trạng thái hư hỏng, ảnh sườn + nóc)
- vehicle_events: Lịch sử xe ra vào bãi (biển số, loại in/out, ảnh)
- status_history: Lịch sử trạng thái thiết bị (online/offline)
- dvrs: Danh sách đầu ghi
- cameras: Danh sách camera

Khi người dùng hỏi về dữ liệu, LUÔN gọi hàm tương ứng để lấy dữ liệu thực từ database. Không bịa số liệu.
Khi người dùng hỏi "hướng dẫn", "phần mềm có gì", "giúp đỡ", "help" → gọi getSoftwareGuide.
Khi người dùng hỏi về tally, kiểm tra hư hỏng → gọi queryTallyEvents.
Khi người dùng gửi hình ảnh, hãy trích xuất thông tin và hỏi xem họ có muốn thêm thiết bị không.`;

      const AI_MODELS = [
        'gemini-3-flash-preview',
        'gemini-2.5-flash',
        'gemini-3.1-flash-preview'
      ];

      let response;
      let lastError;
      let usedModel = AI_MODELS[0];

      for (const model of AI_MODELS) {
        try {
          response = await ai.models.generateContent({
            model: model,
            contents: apiContents,
            config: {
              systemInstruction: systemInstruction,
              tools: [{ functionDeclarations: [addDvrDeclaration, addCameraDeclaration, queryContainerLogsDeclaration, getStatisticsDeclaration, queryDeviceStatusDeclaration, queryVehicleEventsDeclaration, getSystemConfigDeclaration, queryTallyEventsDeclaration, getSoftwareGuideDeclaration] }]
            }
          });
          usedModel = model;
          break; // Success, exit the loop
        } catch (err: any) {
          console.warn(`Model ${model} failed:`, err.message);
          lastError = err;
          // If it's a quota/rate limit error, try the next model
          if (err.message?.includes('429') || err.message?.includes('quota') || err.message?.includes('503')) {
            continue;
          }
          // If it's another type of error (e.g. bad request), throw it immediately
          throw err;
        }
      }

      if (!response) {
        throw lastError || new Error('All AI models failed');
      }

      let aiReply = response.text || '';

      if (response.functionCalls && response.functionCalls.length > 0) {
        const functionResults: Record<string, any> = {};

        for (const call of response.functionCalls) {
          const args = call.args as any;

          if (call.name === 'addDvr') {
            const newDvr = {
              name: args.name,
              ip_address: args.ip_address,
              port: args.port || 80,
              password: args.password || '',
              type: args.type || 'other',
              can_view_direct: args.type === 'hikvision' || args.type === 'dahua'
            };
            if (useMock) {
              const id = `dvr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
              setDvrs(prev => [...prev, { ...newDvr, id }]);
            } else {
              await supabase.from('dvrs').insert([newDvr]);
            }
            functionResults[call.name] = { success: true, message: `Đã thêm DVR "${args.name}" (${args.ip_address})` };
            refetch();
          }
          else if (call.name === 'addCamera') {
            const dvr = dvrs.find(d => d.name.toLowerCase().includes(args.dvr_name.toLowerCase()));
            if (!dvr) {
              functionResults[call.name] = { success: false, message: `Không tìm thấy đầu ghi "${args.dvr_name}"` };
            } else {
              const newCam = { name: args.name, dvr_id: dvr.id, ip_address: args.ip_address || '', password: args.password || '', stream_url: '' };
              if (useMock) {
                const id = `cam-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                setCameras(prev => [...prev, { ...newCam, id }]);
              } else {
                await supabase.from('cameras').insert([newCam]);
              }
              functionResults[call.name] = { success: true, message: `Đã thêm Camera "${args.name}" vào "${dvr.name}"` };
              refetch();
            }
          }
          else if (call.name === 'queryContainerLogs') {
            functionResults[call.name] = await queryContainerLogs(args);
          }
          else if (call.name === 'getStatistics') {
            functionResults[call.name] = await getStatistics(args);
          }
          else if (call.name === 'queryDeviceStatus') {
            functionResults[call.name] = await queryDeviceStatus(args);
          }
          else if (call.name === 'queryVehicleEvents') {
            functionResults[call.name] = await queryVehicleEvents(args);
          }
          else if (call.name === 'getSystemConfig') {
            functionResults[call.name] = getSystemConfig();
          }
          else if (call.name === 'queryTallyEvents') {
            functionResults[call.name] = await queryTallyEvents(args);
          }
          else if (call.name === 'getSoftwareGuide') {
            functionResults[call.name] = getSoftwareGuide();
          }
        }

        // Send function results back to Gemini for natural language response
        try {
          const functionResponseParts = response.functionCalls.map(call => ({
            functionResponse: {
              name: call.name,
              response: functionResults[call.name] || { error: 'Unknown function' }
            }
          }));

          const followUp = await ai.models.generateContent({
            model: usedModel,
            contents: [
              ...apiContents,
              { role: 'model', parts: response.functionCalls.map(call => ({ functionCall: { name: call.name, args: call.args } })) },
              { role: 'user', parts: functionResponseParts }
            ],
            config: { systemInstruction }
          });
          aiReply = followUp.text || aiReply;
        } catch (followUpErr) {
          console.warn('Follow-up failed, using fallback:', followUpErr);
          // Fallback: format results directly
          const parts = Object.entries(functionResults).map(([name, result]) => {
            if (result?.error) return `Lỗi: ${result.error}`;
            if (result?.message) return result.message;
            return JSON.stringify(result, null, 2);
          });
          aiReply = parts.join('\n');
        }
      }

      if (aiReply) {
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'ai', text: aiReply }]);
      }

    } catch (error: any) {
      console.error('AI Error:', error);
      const errMsg = error.message || 'Lỗi không xác định';
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'ai', text: `Xin lỗi, đã có lỗi xảy ra khi kết nối với AI. Chi tiết lỗi: ${errMsg}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Chat Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 p-4 bg-blue-600 hover:bg-blue-500 text-white rounded-full shadow-lg transition-transform hover:scale-105 z-50 flex items-center justify-center"
        >
          <MessageSquare className="w-6 h-6" />
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 w-[360px] h-[500px] bg-[#16181d] border border-[#2a2d36] rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden">
          {/* Header */}
          <div className="p-4 bg-[#1a1d24] border-b border-[#2a2d36] flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-blue-400" />
              <h3 className="font-semibold text-gray-100">Trợ lý AI</h3>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map(msg => (
              <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'ai' && (
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-blue-400" />
                  </div>
                )}
                <div className={`px-4 py-2 rounded-2xl max-w-[80%] text-sm flex flex-col gap-2 ${
                  msg.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-tr-sm' 
                    : 'bg-[#2a2d36] text-gray-200 rounded-tl-sm'
                }`}>
                  {msg.image && (
                    <img src={msg.image} alt="Uploaded" className="max-w-full rounded-lg max-h-48 object-contain bg-black/20" />
                  )}
                  {msg.text && <span>{msg.text}</span>}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-2 justify-start">
                <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-blue-400" />
                </div>
                <div className="px-4 py-3 rounded-2xl bg-[#2a2d36] text-gray-200 rounded-tl-sm flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                  <span className="text-xs text-gray-400">Đang suy nghĩ...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 bg-[#1a1d24] border-t border-[#2a2d36] flex flex-col gap-2">
            {selectedImage && (
              <div className="relative inline-block w-fit">
                <img src={selectedImage} alt="Preview" className="h-16 rounded border border-[#2a2d36] object-cover" />
                <button 
                  onClick={removeImage}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            <div className="flex items-center gap-2 bg-[#0f1115] border border-[#2a2d36] rounded-xl p-1 pr-2 focus-within:border-blue-500 transition-colors">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                ref={fileInputRef}
                onChange={handleImageUpload}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-gray-400 hover:text-blue-400 transition-colors"
                title="Tải ảnh lên"
              >
                <ImagePlus className="w-5 h-5" />
              </button>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                onPaste={handlePaste}
                placeholder="Nhập yêu cầu hoặc dán ảnh (Ctrl+V)..."
                className="flex-1 bg-transparent border-none px-2 py-2 text-sm text-gray-200 focus:outline-none"
              />
              <button
                onClick={handleSend}
                disabled={(!input.trim() && !selectedImage) || isLoading}
                className="p-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
