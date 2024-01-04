import Box from '@mui/system/Box'
import ListColumns from './ListColumns/ListColumns'
import { mapOrder } from '~/utils/sorts'

import {
  DndContext,
  //PointerSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects,
  closestCorners
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { useEffect, useState } from 'react'
import { cloneDeep } from 'lodash'

import Column from './ListColumns/Column/Column'
import Card from './ListColumns/Column/ListCards/Card/Card'

const ACTIVE_DRAG_ITEM_TYPE = {
  COLUMN: 'ACTIVE_DRAG_ITEM_COLUMN',
  CARD: 'ACTIVE_DRAG_ITEM_CARD'
}

function BoardContent({ board }) {
  //https://docs.dndkit.com/api-documentation/sensors
  //nếu dùng PointerSensor mặc định thì phải kết hợp thuộc tính CSS touch-action: none ở những phần tử kéo thả nhưng vẫn còn bug
  //const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 10 } })

  // yêu cầu chuột di chuyển 10px rồi mới kích hoạt event, fix trường hợp click bị gọi event
  const mouseSensor = useSensor(MouseSensor, { activationConstraint: { distance: 10 } })
  // nhấn giữ 250ms và dung sai của cảm ứng (dễ hiểu là độ lướn của vật chạm vào màn hình 500px) thì mới kích hoạt event
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 500 } })

  //ưu tiên dùng cả mouse lẫn touch trong sensor để có trải nghiệm trên mobile là tốt nhất
  //const sensors = useSensors(pointerSensor)
  const sensors = useSensors(mouseSensor, touchSensor)

  const [orderedColumns, setOrderedColumns] = useState([])
  //cùng 1 thời điểm chỉ có 1 phần tử đang được kéo (column hoặc card)
  const [activeDragItemId, setActiveDragItemId] = useState([null])
  const [activeDragItemType, setActiveDragItemType] = useState([null])
  const [activeDragItemData, setActiveDragItemData] = useState([null])

  useEffect(() => {
    setOrderedColumns(mapOrder(board?.columns, board?.columnOrderIds, '_id'))
  }, [board])

  // tìm một cái column theo CardId
  const findColumnByCardId = (cardId) => {
    // lưu ý nên dùng c.cards thay  vì c.cardOrderIds bởi vì ở bước handleDragOver chúng ta sẽ
    //làm dữ liệu cho cards hoàn chỉnh trước rồi mới tạo ra cardOrderIds mới
    return orderedColumns.find(column => column?.cards?.map(card => card._id)?.includes(cardId))
  }

  // Trigger khi bắt đầu kéo 1 phần tử
  const handleDragStart = (event) => {
    //console.log('handleDragStart: ', event)
    setActiveDragItemId(event?.active?.id)
    setActiveDragItemType(event?.active?.data?.current?.columnId ? ACTIVE_DRAG_ITEM_TYPE.CARD : ACTIVE_DRAG_ITEM_TYPE.COLUMN)
    setActiveDragItemData(event?.active?.data?.current)
  }
  //Trigger khi trong quá trình kéo (drag) một phần tử
  const handleDragOver = (event) => {
    //console.log('handleDragOver: ', event)
    // không làm gì thêm nếu kéo collumn
    if (activeDragItemType === ACTIVE_DRAG_ITEM_TYPE.COLUMN) return

    // nếu kéo card thì xử lý thêm để có thể kéo thả card qua lại giữa các columns
    const { active, over } = event

    //đảm bảo nếu không tồn tại active hoặc over (khi kéo thả khỏi phạm vi container) thị không làm gì tránh crash trang
    if (!active || !over) return
    //activeDraggingCardId là card đang được kéo
    const { id: activeDraggingCardId, data: { current: activeDraggingCardData } } = active
    // overCardId là card đang được tương tác trên hoặc dưới so với cái card được kéo ở trên.
    const { id: overCardId } = over

    //tìm hai cái columns theo cardId
    const activeColumn = findColumnByCardId(activeDraggingCardId)
    const overColumn = findColumnByCardId(overCardId)

    if (!activeColumn || !overColumn) return

    //xử lý logic ở đây chỉ khi kéo card qua 2 cloumn khác nhau, còn nếu kéo card trong chính column ban đầu
    // của nó thì không làm gì
    //vì đây đang là  đoạn xử lý lúc kéo (handleDragOver), còn xử lý lúc kéo xong xuôi thì nó lại là vấn đề khác ở (handleDragEnd)
    if (activeColumn._id !== overColumn._id) {
      setOrderedColumns(prevColumns => {
        //tìm vị trí (index) của cái over card trong column đích (nơi mà active card sắp được thả)
        const overCardIndex = overColumn?.cards?.findIndex(card => card._id === overCardId)

        // logic tính toán "cardIndex mới " (trên hoặc dưới của overcard) lấy chuẩn ra từ code cảu thư viện
        let newCardIndex
        const isBelowOverItem = active.rect.current.translated &&
          active.rect.current.translated.top > over.rect.top + over.rect.height

        const modifier = isBelowOverItem ? 1 : 0

        newCardIndex = overCardIndex >= 0 ? overCardIndex + modifier : overColumn?.cards?.length + 1

        const nextColumns = cloneDeep(prevColumns)
        const nextActiveColumn = nextColumns.find(column => column._id === activeColumn._id)
        const nextOverColumn = nextColumns.find(column => column._id === overColumn._id)

        //column cũ
        if (nextActiveColumn) {
          // Xóa card ở cái column active (cũng có thể hiểu là column cũ, lúc mà kéo card ra khỏi nó để sang column khác)

          nextActiveColumn.cards = nextActiveColumn.cards.filter(card => card._id !== activeDraggingCardId)
          // cập nhật lại dữ liệu của mảng cardOderIds
          nextActiveColumn.cardOrderIds = nextActiveColumn.cards.map(card => card._id)
        }
        //column mới
        if (nextOverColumn) {
          //kiểm tra xem card đang kéo có trong overcolumn chưa nếu có thì cần xóa nó trc
          nextOverColumn.cards = nextOverColumn.cards.filter(card => card._id !== activeDraggingCardId)
          //thêm card đang kéo vào overcolumn theo vị trí index mới
          nextOverColumn.cards = nextOverColumn.cards.toSpliced(newCardIndex, 0, activeDraggingCardData)
          //cập nhật lại dữ liệu của mảng cardOderIds
          nextOverColumn.cardOrderIds = nextOverColumn.cards.map(card => card._id)

        }


        return nextColumns
      })
    }
  }

  //Trigger khi kết thúc hành động kéo (drag) một phần tử => hành động thả(drop)
  const handleDragEnd = (event) => {
    //console.log('handleDragEnd: ', event)
    if (activeDragItemType === ACTIVE_DRAG_ITEM_TYPE.CARD) {
      // console.log('kéo thả card: ')
      return
    }

    const { active, over } = event

    //kiểm tra nếu không tồn tại điểm over (kéo linh tinh ra ngoài thì k thực hiện code bên dưới)
    if (!over) return

    //nếu vị trí sau khi kéo khác vị trí ban đầu
    if (active.id !== over.id) {
      // lấy vị trí cũ (từ thằng active)
      const oldIndex = orderedColumns.findIndex(c => c._id === active.id)
      // lấy vị trí mới (từ thằng active)
      const newIndex = orderedColumns.findIndex(c => c._id === over.id)

      //dùng arrayMove của thằng dnd-Kit để sắp xếp lại mảng Column ban đầu
      // Code của arayMove ở đây : dnd-kit/packages/sortable/src/utilities/arrayMove.ts
      const dndOrderedColumns = arrayMove(orderedColumns, oldIndex, newIndex)
      // 2 console.log dung để sau này xử lý gọi API
      //const dndOrderedColumnsIds = dndOrderedColumns.map(c => c._id)
      //console.log('dndOrderedColumns: ', dndOrderedColumns)
      //console.log('dndOrderedColumnsIds: ', dndOrderedColumnsIds)

      //cập nhật lại columns sau khi đã kéo thả
      setOrderedColumns(dndOrderedColumns)
    }

    setActiveDragItemId(null)
    setActiveDragItemType(null)
    setActiveDragItemData(null)
  }

  const customDropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.5' } } })
  }

  return (
    <DndContext
    //cảm biến (p30)
      sensors={sensors}
      //thuật toán phát hiện va chạm (nếu không có nó thì card với cover lớn sẽ không kéo qua column đc
      // vì nó đang bị conflict giữa card và column) => dùng closestCorners của dndKit
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <Box sx={{
        bgcolor: (theme) => (theme.palette.mode === 'dark' ? '#34495e' : '#1976d2'),
        width: '100%',
        height: (theme) => theme.trello.boardContentHeight,
        p: '10px 0'

      }}>
        <ListColumns columns={orderedColumns} />
        <DragOverlay dropAnimation={customDropAnimation}>
          {(!activeDragItemType) && null}
          {(activeDragItemType === ACTIVE_DRAG_ITEM_TYPE.COLUMN) && <Column column={activeDragItemData} />}
          {(activeDragItemType === ACTIVE_DRAG_ITEM_TYPE.CARD) && <Card card={activeDragItemData} />}
        </DragOverlay>
      </Box>

    </DndContext>

  )
}

export default BoardContent
