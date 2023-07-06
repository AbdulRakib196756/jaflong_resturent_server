const express=require('express')
const app=express();
const cors =require('cors');
const  jwt = require('jsonwebtoken');

require('dotenv').config();
const stripe=require('stripe')(process.env.PAYMENT_SECRET_KEY)
const port=process.env.PORT||5000;

//middleware
app.use(cors())
app.use(express.json())

//bearer token
const varifyJWT=(req,res,next)=>{
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'unauthorized access' });
  }
  // bearer token
  const token = authorization.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: 'unauthorized access' })
    }
    req.decoded = decoded;
    next();
  })
  
}


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_user}:${process.env.DB_pass}@cluster0.7lrdivs.mongodb.net/?retryWrites=true&w=majority`;
app.get('/',(req,res)=>{
     res.send("boss is running")
})





// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    

   const usersCollection=client.db("bistroDb").collection("users")
   const menuCollection=client.db("bistroDb").collection("menucollection")
   const reviewCollection=client.db("bistroDb").collection("reviews")
   const cartCollection=client.db("bistroDb").collection("carts")
   const paymentCollection=client.db("bistroDb").collection("Payments")
   

   app.post('/jwt',(req,res)=>{
    const user=req.body;
    const token=jwt.sign(user,process.env.ACCESS_TOKEN_SECRET,{expiresIn:'1h'})
    res.send({token})
   })
   /**
    * 0.do not show secure links to those who should not see
    * 1.use jwt token:verifyJWT
    * 2.use admin vairfy middleware
    */
   const verifyAdmin=async(req,res,next)=>{
    const email=req.decoded.email;
    const query={email:email}
    const user=await usersCollection.findOne(query);
    if(user?.role !=='admin'){
      return  res.status(403).send({error:true,message:'forbidded message'})
    }
    next()
   }

   app.get('/menu',async(req,res)=>{
    const result = await menuCollection.find().toArray()
    res.send(result)
   })
   app.post('/menu',varifyJWT,verifyAdmin,async(req,res)=>{
    const newItem=req.body;
    const result= await menuCollection.insertOne(newItem)
    res.send(result)
   })
   app.delete('/menu/:id',varifyJWT,verifyAdmin,async(req,res)=>{
    const id=req.params.id;
    const query={_id: new ObjectId(id)}
    const result =await menuCollection.deleteOne(query)
    res.send(result)

   })
   app.get('/review',async(req,res)=>{
    const result = await reviewCollection.find().toArray()
    res.send(result)
   })

  //  cart collection
  app.post('/carts',async(req,res)=>{
    const item=req.body;
    
    const result =await cartCollection.insertOne(item)
    res.send(result)
  })
  app.get('/carts', varifyJWT, async (req, res) => {
    const email = req.query.email;

    if (!email) {
      res.send([]);
  }

    const decodedEmail = req.decoded.email;
    if (email !== decodedEmail) {
      return res.status(403).send({ error: true, message: 'porviden access' })
    }

    const query = { email: email };
    const result = await cartCollection.find(query).toArray();
    res.send(result);
  });

  app.delete('/carts/:id',async(req,res)=>{
    const id = req.params.id;
    const query={_id:new ObjectId(id)};
    const result=await cartCollection.deleteOne(query)
    res.send(result)
  })
  // payment 
  app.post('/create-payment-intent',varifyJWT,async(req,res)=>{
    const {price}=req.body;
    const amount=price*100;
    //stripe pyment used cent so multiply with 100
    const paymentIntent=await stripe.paymentIntents.create({
      amount:amount,
      currency:'usd',
      payment_method_types:['card']
    });
    res.send({
      clientSecret:paymentIntent.client_secret
    })
    
  })

  app.post('/payments',varifyJWT,async(req,res)=>{
    const payment=req.body;
    const insertResult =await paymentCollection.insertOne(payment);
    const query = { _id: { $in: payment.items.map(id => new ObjectId(id)) } }
    const deleteResult = await cartCollection.deleteMany(query)
    res.send({ insertResult, deleteResult });

  })

 
  app.post('/users',async(req,res)=>{
    const user=req.body;
    const query={email:user.email};
    const existinguser=await usersCollection.findOne(query);
    if(existinguser){
      return res.send({message:'user already exists'})
    }
    const result =await usersCollection.insertOne(user);
    res.send(result);
  })

  //users
  app.get('/users',varifyJWT,verifyAdmin,async(req,res)=>{
    const result =await usersCollection.find().toArray();
    res.send(result)
  })

  app.patch('/users/admin/:id',async(req,res)=>{
    const id=req.params.id;
    const filter={_id:new ObjectId(id)}
    const updateDoc={
      $set:{
        role:'admin'
      },
    }
    const result =await usersCollection.updateOne(filter,updateDoc);
    res.send(result);
  })

  app.get('/users/admin/:email',varifyJWT,async(req,res)=>{
    const email = req.params.email;

    if (req.decoded.email !== email) {
      res.send({ admin: false })
    }

    const query = { email: email }
    const user = await usersCollection.findOne(query);
    const result = { admin: user?.role === 'admin' }
    res.send(result);
  })
  // dashboard
  app.get('/admin-stats',varifyJWT,verifyAdmin,async(req,res)=>{
    const users=await usersCollection.estimatedDocumentCount();
    const products=await menuCollection.estimatedDocumentCount();
    const orders=await paymentCollection.estimatedDocumentCount();
    // best way to get sum of a feild is to use group and sum operator 
    const payments=await paymentCollection.find().toArray();
    const revenue=payments.reduce((sum,payment)=>sum+payment.price,0)
    res.send({
      revenue,
      users,
      products,
      orders
    })
  })


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
   
  }
}
run().catch(console.dir);








app.listen(port ,()=>{
    console.log(`boss is running at port ${port}`)
})


/** */