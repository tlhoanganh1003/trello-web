import Box from '@mui/system/Box'
import theme from '~/theme'

function BoadContent() {
  return (
    <Box sx={{
      bgcolor: (theme) => (theme.palette.mode === 'dark' ? '#34495e' : '#1976d2'),
      width:'100%',
      height: `calc(100vh - ${ theme.trello.appBarHeight }-${ theme.trello.boardBarHeight })`,
      display: 'flex',
      alignItems: 'center'
    }}>
            hoang anh boadcontent
    </Box>
  )
}

export default BoadContent
